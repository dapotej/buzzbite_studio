"use client";
import { getFontEmbedCSS, toCanvas, toPng } from "html-to-image";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { MOTION_SECONDS, POST_H, POST_W } from "@/templates/PostCanvas";

/** Loads a brand's Google Fonts with CORS so they can be embedded in exports. */
export function ensureFonts(families: string[]) {
  for (const f of new Set(families.filter(Boolean))) {
    const id = `gf-${f.replace(/\W+/g, "-")}`;
    if (document.getElementById(id)) continue;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.crossOrigin = "anonymous";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
}

const opts = (fontEmbedCSS: string) => ({ width: POST_W, height: POST_H, pixelRatio: 1, fontEmbedCSS, cacheBust: false });

export async function exportPng(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  const css = await getFontEmbedCSS(node);
  const url = await toPng(node, opts(css));
  return (await fetch(url)).blob();
}

function animationsOf(node: HTMLElement): Animation[] {
  return node.getAnimations({ subtree: true });
}

async function pickCodec(): Promise<{ codec: string; muxCodec: "avc" | "vp9" } | null> {
  if (typeof VideoEncoder === "undefined") return null;
  const candidates: { codec: string; muxCodec: "avc" | "vp9" }[] = [
    { codec: "avc1.640028", muxCodec: "avc" }, // H.264 High: what Instagram and LinkedIn expect
    { codec: "avc1.4d0028", muxCodec: "avc" },
    { codec: "vp09.00.40.08", muxCodec: "vp9" },
  ];
  for (const c of candidates) {
    const { supported } = await VideoEncoder.isConfigSupported({ codec: c.codec, width: POST_W, height: POST_H, bitrate: 8_000_000, framerate: 30 });
    if (supported) return c;
  }
  return null;
}

/**
 * Records the motion template frame by frame: every CSS animation inside `node`
 * is paused and seeked to the frame's time, the DOM is drawn to a canvas, and the
 * frames are encoded to MP4 in the browser.
 */
export async function exportMp4(node: HTMLElement, onProgress: (fraction: number) => void): Promise<{ blob: Blob; codec: string }> {
  const picked = await pickCodec();
  if (!picked) throw new Error("This browser cannot encode video. Use a recent Chrome, Edge or Safari.");
  await document.fonts.ready;
  const fontCss = await getFontEmbedCSS(node);
  const fps = 30;
  const frames = MOTION_SECONDS * fps;

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: picked.muxCodec, width: POST_W, height: POST_H }, fastStart: "in-memory" });
  let encodeError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encodeError = e),
  });
  encoder.configure({ codec: picked.codec, width: POST_W, height: POST_H, bitrate: 8_000_000, framerate: fps });

  const anims = animationsOf(node);
  try {
    for (let f = 0; f < frames; f++) {
      if (encodeError) throw encodeError;
      const t = (f / fps) * 1000;
      for (const a of anims) {
        a.pause();
        a.currentTime = t;
      }
      const canvas = await toCanvas(node, opts(fontCss));
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1_000_000) / fps), duration: Math.round(1_000_000 / fps) });
      encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      // Keep the encoder queue short so memory stays flat.
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
      onProgress((f + 1) / frames);
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
  } finally {
    if (encoder.state !== "closed") encoder.close();
    for (const a of anims) {
      a.currentTime = 0;
      a.play();
    }
  }
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), codec: picked.codec };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
