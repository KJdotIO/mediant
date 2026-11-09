import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from "mediabunny";
import { loadPack, Piano, type SoundId } from "../audio/piano.ts";
import { FrameRenderer, LAYOUTS, type FrameOptions, type VideoLayout } from "./frame.ts";
import { toMidiFile, type Take } from "./take.ts";

const FPS = 30;
const SAMPLE_RATE = 48000;

/** Plays the take through the piano in an offline context, faster than real time. */
export async function renderAudio(take: Take, sound: SoundId): Promise<AudioBuffer> {
  const loaded = await loadPack(sound);
  const offline = new OfflineAudioContext(2, Math.ceil(take.duration * SAMPLE_RATE), SAMPLE_RATE);
  const piano = new Piano(offline);
  piano.use(loaded);
  for (const event of take.events) piano.handle(event, event.t);
  piano.handle({ type: "clear" }, Math.max(0, take.duration - 0.1));
  return offline.startRendering();
}

export interface VideoOptions extends FrameOptions {
  sound: SoundId;
  onProgress: (fraction: number) => void;
}

/**
 * Renders a take to video: MP4 with H.264 and AAC where the browser can encode them, which is
 * what Instagram, TikTok and YouTube expect, otherwise WebM.
 */
export async function exportVideo(take: Take, layout: VideoLayout, options: VideoOptions): Promise<{ blob: Blob; extension: string }> {
  const { width, height } = LAYOUTS[layout];
  await Promise.all([document.fonts.load(`700 40px "Archivo Variable"`), document.fonts.load("30px Bravura")]);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new FrameRenderer(canvas.getContext("2d")!, layout, take, options);

  options.onProgress(0);
  const audio = await renderAudio(take, options.sound);
  options.onProgress(0.05);

  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9"], { width, height });
  if (!videoCodec) throw new Error("This browser can't encode video.");
  const mp4 = videoCodec === "avc";
  const audioCodec = await getFirstEncodableAudioCodec(mp4 ? ["aac", "opus"] : ["opus"], { numberOfChannels: 2, sampleRate: SAMPLE_RATE });

  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  const sound = audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH }) : undefined;
  if (sound) output.addAudioTrack(sound);
  await output.start();
  if (sound) await sound.add(audio);

  const frames = Math.ceil(take.duration * FPS);
  for (let frame = 0; frame < frames; frame++) {
    renderer.draw(frame / FPS);
    await video.add(frame / FPS, 1 / FPS);
    if (frame % 10 === 0) options.onProgress(0.05 + (0.95 * frame) / frames);
  }
  await output.finalize();
  options.onProgress(1);
  return { blob: new Blob([output.target.buffer!], { type: mp4 ? "video/mp4" : "video/webm" }), extension: mp4 ? "mp4" : "webm" };
}

export function midiBlob(take: Take): Blob {
  return new Blob([toMidiFile(take).slice().buffer], { type: "audio/midi" });
}

/** Saves a file through the browser's download. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
