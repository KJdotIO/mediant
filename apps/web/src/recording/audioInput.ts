import { useCallback, useEffect, useState } from "react";

export interface AudioInput {
  deviceId: string;
  label: string;
}

/**
 * The audio inputs the browser can record from, such as BlackHole or an audio interface.
 * Browsers hide input names until the page has asked for permission once.
 */
export function useAudioInputs() {
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [named, setNamed] = useState(false);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    setNamed(devices.some((d) => d.label));
    setInputs(
      devices
        .filter((d) => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` })),
    );
  }, []);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, [refresh]);

  const allow = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    await refresh();
  }, [refresh]);

  return { inputs, named, allow };
}

export interface Capture {
  /** When the first recorded sample was captured, as a performance.now() time. */
  started: Promise<number>;
  stop: () => Promise<Blob>;
}

/** A stream tests can hand in instead of a real device, in dev builds only. */
const fakeInput = () => (import.meta.env.DEV ? (window as { mediantFakeInput?: MediaStream }).mediantFakeInput : undefined);

/**
 * Records an input exactly as it arrives: echo cancellation, noise suppression and automatic
 * gain are off, because they would change the sound of an instrument.
 */
export async function startCapture(deviceId: string): Promise<Capture> {
  const stream =
    fakeInput() ??
    (await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      },
    }));
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 192_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const started = new Promise<number>((resolve) => recorder.addEventListener("start", () => resolve(performance.now()), { once: true }));
  recorder.start(1000);
  return {
    started,
    stop: () =>
      new Promise((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            if (stream !== fakeInput()) for (const track of stream.getTracks()) track.stop();
            resolve(new Blob(chunks, { type: recorder.mimeType }));
          },
          { once: true },
        );
        recorder.stop();
      }),
  };
}
