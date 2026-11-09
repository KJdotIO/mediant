import { useCallback, useEffect, useState } from "react";
import { audioContext } from "../audio/context.ts";

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
  /** Reads the input's level while it records, for the meter. */
  analyser: AnalyserNode;
  stop: () => Promise<Blob>;
}

/** A stream tests can hand in instead of a real device, in dev builds only. */
const fakeInput = () => (import.meta.env.DEV ? (window as { mediantFakeInput?: MediaStream }).mediantFakeInput : undefined);

/**
 * Opens an input exactly as it arrives: echo cancellation, noise suppression and automatic gain
 * are off, because they would change the sound of an instrument.
 */
async function openInput(deviceId: string): Promise<MediaStream> {
  return (
    fakeInput() ??
    navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      },
    })
  );
}

const closeInput = (stream: MediaStream) => {
  if (stream !== fakeInput()) for (const track of stream.getTracks()) track.stop();
};

/** An analyser fed by the stream. It doesn't play the input, it only measures it. */
function analyse(stream: MediaStream): { analyser: AnalyserNode; disconnect: () => void } {
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  return { analyser, disconnect: () => source.disconnect() };
}

/**
 * Listens to an input only to show its level, while Settings is open. macOS shows the orange
 * microphone dot while this runs, so it never stays on in the background.
 */
export function useInputLevel(deviceId: string, active: boolean): AnalyserNode | undefined {
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  useEffect(() => {
    if (!active || !deviceId) return;
    let cancelled = false;
    let cleanup = () => {};
    openInput(deviceId)
      .then((stream) => {
        if (cancelled) return closeInput(stream);
        const meter = analyse(stream);
        setAnalyser(meter.analyser);
        cleanup = () => {
          meter.disconnect();
          closeInput(stream);
        };
      })
      .catch(() => setAnalyser(undefined));
    return () => {
      cancelled = true;
      cleanup();
      setAnalyser(undefined);
    };
  }, [deviceId, active]);
  return analyser;
}

/** Records an input, and measures it for the meter while it records. */
export async function startCapture(deviceId: string): Promise<Capture> {
  const stream = await openInput(deviceId);
  const meter = analyse(stream);
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 192_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const started = new Promise<number>((resolve) => recorder.addEventListener("start", () => resolve(performance.now()), { once: true }));
  recorder.start(1000);
  return {
    started,
    analyser: meter.analyser,
    stop: () =>
      new Promise((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            meter.disconnect();
            closeInput(stream);
            resolve(new Blob(chunks, { type: recorder.mimeType }));
          },
          { once: true },
        );
        recorder.stop();
      }),
  };
}
