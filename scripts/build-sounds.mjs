// Builds the piano sound packs in apps/web/public/sounds from public-domain and CC0 sources.
// Downloads only the samples each pack uses, trims long tails with a fade, and encodes AAC
// with macOS afconvert. Run with: node scripts/build-sounds.mjs [pack-id ...]

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "sounds");
const OUT = join(ROOT, "apps", "web", "public", "sounds");
const SOURCE = "https://huggingface.co/datasets/cueharbor/starter-instruments/resolve/main";
const BITRATE = 96000;
const FADE_SECONDS = 1;

const PACKS = [
  {
    id: "felt",
    name: "Felt Piano",
    description: "Soft, close upright with felt between hammer and strings.",
    source: "felt-piano",
    license: "Public domain",
    credit: "Fuchs & Möhr Felt Piano by Tom Guder",
    url: "https://www.polyphone.io/en/soundfonts/pianos/683-fuchs-mohr-felt-piano",
    release: 0.35,
    maxSeconds: 8,
    keep: (region) => (region.key - 21) % 3 === 0,
  },
  {
    id: "upright",
    name: "Upright Piano",
    description: "Warm, intimate upright.",
    source: "upright-piano",
    license: "CC0 1.0",
    credit: "Knight upright piano, Versilian Community Sample Library (VCSL) by Versilian Studios",
    url: "https://github.com/sgossner/VCSL",
    release: 0.25,
    maxSeconds: 10,
    keep: (region, index) => index % 2 === 0,
  },
  {
    id: "grand",
    name: "Grand Piano",
    description: "Bright, full Kawai grand.",
    source: "grand-piano",
    license: "CC0 1.0",
    credit: "Kawai grand piano, Versilian Community Sample Library (VCSL) by Versilian Studios",
    url: "https://github.com/sgossner/VCSL",
    release: 0.25,
    maxSeconds: 10,
    keep: () => true,
  },
];

/** Reads the sustain regions of an SFZ file, skipping release-trigger groups. */
function parseSfz(text) {
  const regions = [];
  let release = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("<group>")) release = /trigger=release/.test(line);
    if (!line.startsWith("<region>") || release) continue;
    const attr = Object.fromEntries([...line.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]));
    regions.push({ sample: attr.sample, key: Number(attr.pitch_keycenter), lovel: Number(attr.lovel), hivel: Number(attr.hivel) });
  }
  return regions;
}

async function download(url, path) {
  try {
    await stat(path);
    return;
  } catch {}
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

/** Parses a PCM WAV file into 16-bit interleaved frames. Supports 16- and 24-bit input. */
function readWav(buffer) {
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = { channels: buffer.readUInt16LE(body + 2), rate: buffer.readUInt32LE(body + 4), bits: buffer.readUInt16LE(body + 14) };
    } else if (id === "data") {
      data = buffer.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!format || !data) throw new Error("Not a PCM WAV file");
  const bytes = format.bits / 8;
  const count = Math.floor(data.length / bytes);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = format.bits === 24 ? data.readIntLE(i * 3, 3) >> 8 : data.readInt16LE(i * 2);
  }
  return { ...format, samples };
}

function writeWav({ channels, rate, samples }) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

/** Cuts the sample to maxSeconds with a fade over the last second. */
function trim(wav, maxSeconds) {
  const frames = Math.min(wav.samples.length / wav.channels, Math.round(maxSeconds * wav.rate));
  const out = wav.samples.slice(0, frames * wav.channels);
  const fadeFrames = Math.min(frames, Math.round(FADE_SECONDS * wav.rate));
  for (let f = frames - fadeFrames; f < frames; f++) {
    const gain = ((frames - f) / fadeFrames) ** 2;
    for (let c = 0; c < wav.channels; c++) out[f * wav.channels + c] = Math.round(out[f * wav.channels + c] * gain);
  }
  return { ...wav, samples: out };
}

async function pool(items, size, task) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}

async function build(pack) {
  const sfz = await (await fetch(`${SOURCE}/${pack.source}/instrument.sfz`)).text();
  const regions = parseSfz(sfz);
  const ranges = [...new Set(regions.map((r) => `${r.lovel}-${r.hivel}`))]
    .map((range) => range.split("-").map(Number))
    .sort((a, b) => a[0] - b[0]);
  const zones = ranges.flatMap(([lo, hi], layer) =>
    regions
      .filter((r) => r.lovel === lo && r.hivel === hi)
      .sort((a, b) => a.key - b.key)
      .filter((r, i) => pack.keep(r, i))
      .map((r) => ({ ...r, layer, file: `${r.key}-v${layer + 1}.m4a` })),
  );

  const dir = join(OUT, pack.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let done = 0;
  await pool(zones, 6, async (zone) => {
    const cached = join(CACHE, pack.source, zone.sample);
    await download(`${SOURCE}/${pack.source}/${zone.sample}`, cached);
    const wav = trim(readWav(await readFile(cached)), pack.maxSeconds);
    const temp = join(CACHE, "tmp", `${pack.id}-${zone.file}.wav`);
    await mkdir(dirname(temp), { recursive: true });
    await writeFile(temp, writeWav(wav));
    await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", String(BITRATE), temp, join(dir, zone.file)]);
    await rm(temp);
    process.stdout.write(`\r${pack.id}: ${++done}/${zones.length}`);
  });
  process.stdout.write("\n");

  const manifest = {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    license: pack.license,
    credit: pack.credit,
    url: pack.url,
    release: pack.release,
    layers: ranges.map(([lo, hi]) => ({ lo, hi })),
    zones: zones.map(({ key, layer, file }) => ({ key, layer, file })),
  };
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(dir, "LICENSE.txt"),
    `${pack.name}\n\nSamples: ${pack.credit}\nSource: ${pack.url}\nLicence: ${pack.license}\n\n` +
      `Selected, trimmed to ${pack.maxSeconds} seconds with a fade, and encoded to AAC for Mediant.\n` +
      `Prepared copy used as the download source: ${SOURCE}/${pack.source}\n`,
  );
}

const wanted = process.argv.slice(2);
for (const pack of PACKS.filter((p) => wanted.length === 0 || wanted.includes(p.id))) await build(pack);
