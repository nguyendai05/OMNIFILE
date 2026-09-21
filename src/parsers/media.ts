import type { FileParser, FileRecord, MediaDocument, ParserContext } from "@/core/types";
import { throwIfAborted } from "@/core/errors";

function mediaEl(blob: Blob, kind: "audio" | "video"): HTMLMediaElement {
  const el = document.createElement(kind);
  el.preload = "metadata";
  el.src = URL.createObjectURL(blob);
  return el;
}

function waitMeta(el: HTMLMediaElement, timeout = 8000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener("loadedmetadata", done);
      el.removeEventListener("error", done);
      resolve();
    };
    el.addEventListener("loadedmetadata", done);
    el.addEventListener("error", done);
    setTimeout(done, timeout);
  });
}

async function waveformFrom(blob: Blob, signal?: AbortSignal): Promise<number[] | undefined> {
  if (typeof AudioContext === "undefined") return;
  try {
    throwIfAborted(signal);
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const ch = buf.getChannelData(0);
    const buckets = 240;
    const step = Math.max(1, Math.floor(ch.length / buckets));
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const start = i * step;
      for (let j = 0; j < step && start + j < ch.length; j += 8) {
        const v = Math.abs(ch[start + j]!);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    await ctx.close();
    return peaks;
  } catch {
    return;
  }
}

export const audioParser: FileParser = {
  id: "audio",
  version: "1.0.0",
  label: "Audio",
  supports: (f: FileRecord) => f.kind === "audio",
  async parse(file, ctx: ParserContext): Promise<MediaDocument> {
    throwIfAborted(ctx.signal);
    const el = mediaEl(ctx.blob, "audio") as HTMLAudioElement;
    await waitMeta(el);
    const duration = Number.isFinite(el.duration) ? el.duration : undefined;
    URL.revokeObjectURL(el.src);
    ctx.onProgress?.({ message: "Building waveform" });
    const waveform = await waveformFrom(ctx.blob, ctx.signal);
    return {
      kind: "audio",
      fileId: file.id,
      duration,
      waveform,
    };
  },
};

export const videoParser: FileParser = {
  id: "video",
  version: "1.0.0",
  label: "Video",
  supports: (f: FileRecord) => f.kind === "video",
  async parse(file, ctx: ParserContext): Promise<MediaDocument> {
    throwIfAborted(ctx.signal);
    const el = mediaEl(ctx.blob, "video") as HTMLVideoElement;
    await waitMeta(el);
    const duration = Number.isFinite(el.duration) ? el.duration : undefined;
    const width = el.videoWidth || undefined;
    const height = el.videoHeight || undefined;
    URL.revokeObjectURL(el.src);
    return { kind: "video", fileId: file.id, duration, width, height };
  },
};
