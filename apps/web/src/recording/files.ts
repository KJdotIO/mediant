import { toMidiFile, type Take } from "./take.ts";

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
