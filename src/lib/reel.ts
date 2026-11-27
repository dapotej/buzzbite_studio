"use client";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { ensureFonts } from "./export";
import type { BrandProfile, PostSpec } from "./types";

// Reels are drawn straight onto a 1080×1920 canvas: each scene's clip, the title, captions,
// word-by-word subtitles and an end card, with the voice-overs mixed over the music.
// The same drawing powers the in-app preview and the MP4 export.

export const REEL_W = 1080;
export const REEL_H = 1920;
const FPS = 30;
const END_CARD = 2.2; // seconds
const TITLE_SECONDS = 2.6;

export type LoadedScene = { video: HTMLVideoElement; voice: AudioBuffer | null; start: number; dur: number; caption: string; words: string[] };
export type LoadedReel = { scenes: LoadedScene[]; music: AudioBuffer | null; logo: HTMLImageElement | null; total: number };
export type ReelInput = { spec: PostSpec; brand: BrandProfile; logo: string | null };

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "auto";
    v.addEventListener("loadeddata", () => resolve(v), { once: true });
    v.addEventListener("error", () => reject(new Error("A scene's clip could not be loaded.")), { once: true });
    v.src = url;
  });
}
async function loadAudio(url: string | null): Promise<AudioBuffer | null> {
  if (!url) return null;
  try {
    const data = await (await fetch(url)).arrayBuffer();
    return await new OfflineAudioContext(2, 1, 44100).decodeAudioData(data);
  } catch {
    return null;
  }
}
function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Loads every clip, voice-over, the music and the logo, and lays out the timeline. */
export async function loadReel({ spec, brand, logo }: ReelInput): Promise<LoadedReel> {
  const assets = spec.reel;
  if (!assets) throw new Error("This reel isn't ready yet.");
  ensureFonts([brand.fonts.display, brand.fonts.body]);
  const [videos, voices, music, logoImg] = await Promise.all([
    Promise.all(assets.scenes.map((s) => loadVideo(s.clip!))),
    Promise.all(assets.scenes.map((s) => loadAudio(s.voice))),
    loadAudio(assets.music),
    loadImage(logo),
  ]);
  await document.fonts.ready;
  let t = 0;
  const scenes = videos.map((video, i) => {
    const dur = Math.min(7, Math.max(3.2, (voices[i]?.duration ?? 4) + 0.6));
    const s: LoadedScene = { video, voice: voices[i], start: t, dur, caption: spec.scenes[i]?.caption ?? "", words: (spec.scenes[i]?.voiceover ?? "").split(/\s+/).filter(Boolean) };
    t += dur;
    return s;
  });
  return { scenes, music, logo: logoImg, total: t + END_CARD };
}

/** Which scene is on screen at time t, and how far into it. Null during the end card. */
export function sceneAt(r: LoadedReel, t: number): { scene: LoadedScene; index: number; local: number } | null {
  for (const [index, scene] of r.scenes.entries()) if (t < scene.start + scene.dur) return { scene, index, local: Math.max(0, t - scene.start) };
  return null;
}

// ---------- drawing ----------
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkOn = (bg: string) => (lum(bg) > 0.45 ? "#111111" : "#FFFFFF");

function wrap(ctx: CanvasRenderingContext2D, words: string[], maxWidth: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  for (const w of words) {
    const test = [...line, w].join(" ");
    if (line.length && ctx.measureText(test).width > maxWidth) { lines.push(line); line = [w]; } else line.push(w);
  }
  if (line.length) lines.push(line);
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, el: CanvasImageSource & { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number }) {
  const w = el.videoWidth || el.naturalWidth || REEL_W;
  const h = el.videoHeight || el.naturalHeight || REEL_H;
  const scale = Math.max(REEL_W / w, REEL_H / h);
  const dw = w * scale, dh = h * scale;
  ctx.drawImage(el, (REEL_W - dw) / 2, (REEL_H - dh) / 2, dw, dh);
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, font: string) {
  ctx.font = `800 40px "${font}", sans-serif`;
  const w = ctx.measureText(text.toUpperCase()).width;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x, y, w + 48, 68, 14); ctx.fill();
  ctx.fillStyle = inkOn(bg);
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), x + 24, y + 35);
}

/** Draws the reel at time t. The caller has already moved the scene's video to the right moment. */
export function drawReelFrame(ctx: CanvasRenderingContext2D, r: LoadedReel, t: number, { spec, brand }: ReelInput) {
  const { primary, dark } = brand.colors;
  const display = brand.fonts.display || "Inter";
  ctx.save();
  ctx.clearRect(0, 0, REEL_W, REEL_H);
  const at = sceneAt(r, t);

  if (!at) {
    // End card: logo and call to action on the brand's dark colour.
    ctx.fillStyle = dark; ctx.fillRect(0, 0, REEL_W, REEL_H);
    if (r.logo) {
      const s = Math.min(620 / r.logo.naturalWidth, 300 / r.logo.naturalHeight);
      ctx.drawImage(r.logo, (REEL_W - r.logo.naturalWidth * s) / 2, 700 - r.logo.naturalHeight * s / 2, r.logo.naturalWidth * s, r.logo.naturalHeight * s);
    }
    const cta = spec.cta || brand.ctas[0] || brand.website || brand.name;
    ctx.font = `700 56px "${display}", sans-serif`; ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    wrap(ctx, cta.split(/\s+/), 900).forEach((line, i) => ctx.fillText(line.join(" "), REEL_W / 2, 1060 + i * 72));
    ctx.restore();
    return;
  }

  const { scene, index, local } = at;
  drawCover(ctx, scene.video);
  // Shade top and bottom so text reads on any footage.
  const top = ctx.createLinearGradient(0, 0, 0, 520); top.addColorStop(0, "rgba(0,0,0,0.55)"); top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, REEL_W, 520);
  const bottom = ctx.createLinearGradient(0, REEL_H - 820, 0, REEL_H); bottom.addColorStop(0, "rgba(0,0,0,0)"); bottom.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = bottom; ctx.fillRect(0, REEL_H - 820, REEL_W, 820);

  if (r.logo) {
    const s = 64 / r.logo.naturalHeight;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(r.logo, 64, 96, Math.min(320, r.logo.naturalWidth * s), Math.min(320, r.logo.naturalWidth * s) * (r.logo.naturalHeight / r.logo.naturalWidth));
    ctx.globalAlpha = 1;
  }

  // Title over the first scene; a caption chip over the others.
  if (index === 0 && local < TITLE_SECONDS) {
    const fade = Math.min(1, local / 0.3, (TITLE_SECONDS - local) / 0.4);
    ctx.globalAlpha = Math.max(0, fade);
    if (spec.kicker) chip(ctx, spec.kicker, 64, 300, primary, display);
    ctx.font = `800 104px "${display}", sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const parts = spec.headline.split(/(\*[^*]+\*)/).flatMap((p) => p.split(/\s+/).filter(Boolean).map((w) => ({ w: w.replace(/\*/g, ""), hi: p.startsWith("*") })));
    let y = 520;
    for (const line of wrap(ctx, parts.map((p) => p.w), 940)) {
      let x = 64;
      for (const w of line) {
        const hi = parts.find((p) => p.w === w)?.hi;
        ctx.fillStyle = hi ? primary : "#FFFFFF";
        ctx.fillText(w, x, y);
        x += ctx.measureText(w + " ").width;
      }
      y += 112;
    }
    ctx.globalAlpha = 1;
  } else if (scene.caption) {
    chip(ctx, scene.caption, 64, 300, primary, display);
  }

  // Subtitles: three to four words at a time, the spoken word in the brand colour.
  const voiceDur = scene.voice?.duration ?? scene.dur - 0.6;
  const spoken = local - 0.15;
  if (scene.words.length && spoken >= 0 && spoken <= voiceDur + 0.3) {
    const per = voiceDur / scene.words.length;
    const current = Math.min(scene.words.length - 1, Math.floor(spoken / per));
    const chunkSize = 4;
    const chunk = Math.floor(current / chunkSize);
    const words = scene.words.slice(chunk * chunkSize, chunk * chunkSize + chunkSize);
    ctx.font = `800 80px "${display}", sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.lineWidth = 12; ctx.strokeStyle = "rgba(0,0,0,0.85)";
    const lines = wrap(ctx, words, 940);
    let y = 1500 - (lines.length - 1) * 50;
    let k = chunk * chunkSize;
    for (const line of lines) {
      const width = ctx.measureText(line.join(" ")).width;
      let x = (REEL_W - width) / 2;
      for (const w of line) {
        ctx.strokeText(w, x, y);
        ctx.fillStyle = k === current ? (lum(primary) < 0.08 ? "#FFE14D" : primary) : "#FFFFFF";
        ctx.fillText(w, x, y);
        x += ctx.measureText(w + " ").width;
        k++;
      }
      y += 100;
    }
  }
  ctx.restore();
}

// ---------- audio ----------
/** Voice-overs at their scenes over the music, which is kept low and fades in and out. */
export async function mixAudio(r: LoadedReel, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(r.total * sampleRate), sampleRate);
  if (r.music) {
    const src = ctx.createBufferSource(); src.buffer = r.music; src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(0.22, 0.6);
    gain.gain.setValueAtTime(0.22, Math.max(0.7, r.total - 1.6));
    gain.gain.linearRampToValueAtTime(0, r.total);
    src.connect(gain).connect(ctx.destination); src.start(0);
  }
  for (const s of r.scenes) {
    if (!s.voice) continue;
    const src = ctx.createBufferSource(); src.buffer = s.voice;
    src.connect(ctx.destination); src.start(s.start + 0.15);
  }
  return ctx.startRendering();
}

// ---------- export ----------
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(time, (video.duration || 5) - 0.05));
  if (Math.abs(video.currentTime - target) < 0.004) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.currentTime = target;
  });
}

async function pickVideoCodec(): Promise<{ codec: string; mux: "avc" | "vp9" } | null> {
  if (typeof VideoEncoder === "undefined") return null;
  for (const c of [{ codec: "avc1.640033", mux: "avc" as const }, { codec: "avc1.640032", mux: "avc" as const }, { codec: "avc1.4d0033", mux: "avc" as const }, { codec: "vp09.00.41.08", mux: "vp9" as const }]) {
    if ((await VideoEncoder.isConfigSupported({ codec: c.codec, width: REEL_W, height: REEL_H, bitrate: 10_000_000, framerate: FPS })).supported) return c;
  }
  return null;
}
async function pickAudioCodec(): Promise<{ codec: string; mux: "aac" | "opus"; sampleRate: number } | null> {
  if (typeof AudioEncoder === "undefined") return null;
  for (const c of [{ codec: "mp4a.40.2", mux: "aac" as const, sampleRate: 44100 }, { codec: "opus", mux: "opus" as const, sampleRate: 48000 }]) {
    if ((await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate: c.sampleRate, numberOfChannels: 2, bitrate: 128_000 })).supported) return c;
  }
  return null;
}

/** Records the reel to an MP4 with sound, frame by frame. `audio` is the sound codec used: "aac" is what Instagram expects. */
export async function exportReel(input: ReelInput, onProgress: (f: number) => void = () => {}): Promise<{ blob: Blob; audio: "aac" | "opus" | null }> {
  const video = await pickVideoCodec();
  if (!video) throw new Error("This browser can't record video. Use a recent Chrome, Edge or Safari.");
  const audio = await pickAudioCodec();
  const r = await loadReel(input);
  const mixed = audio ? await mixAudio(r, audio.sampleRate) : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: video.mux, width: REEL_W, height: REEL_H },
    ...(audio && mixed ? { audio: { codec: audio.mux, sampleRate: audio.sampleRate, numberOfChannels: 2 } } : {}),
    fastStart: "in-memory",
  });
  let failure: unknown = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  venc.configure({ codec: video.codec, width: REEL_W, height: REEL_H, bitrate: 10_000_000, framerate: FPS });

  const canvas = document.createElement("canvas");
  canvas.width = REEL_W; canvas.height = REEL_H;
  const ctx = canvas.getContext("2d")!;
  const frames = Math.ceil(r.total * FPS);
  try {
    for (let f = 0; f < frames; f++) {
      if (failure) throw failure;
      const t = f / FPS;
      const at = sceneAt(r, t);
      if (at) await seek(at.scene.video, at.local);
      drawReelFrame(ctx, r, t, input);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise((res) => setTimeout(res, 4));
      onProgress(((f + 1) / frames) * (audio ? 0.9 : 1));
    }
    await venc.flush();

    if (audio && mixed) {
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) });
      aenc.configure({ codec: audio.codec, sampleRate: audio.sampleRate, numberOfChannels: 2, bitrate: 128_000 });
      const [left, right] = [mixed.getChannelData(0), mixed.getChannelData(mixed.numberOfChannels > 1 ? 1 : 0)];
      const block = 1024;
      for (let i = 0; i < left.length; i += block) {
        const n = Math.min(block, left.length - i);
        const planar = new Float32Array(n * 2);
        planar.set(left.subarray(i, i + n), 0);
        planar.set(right.subarray(i, i + n), n);
        const data = new AudioData({ format: "f32-planar", sampleRate: audio.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / audio.sampleRate) * 1e6), data: planar });
        aenc.encode(data);
        data.close();
      }
      await aenc.flush();
      aenc.close();
      onProgress(1);
    }
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    if (venc.state !== "closed") venc.close();
  }
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), audio: audio && mixed ? audio.mux : null };
}
