"use client";
import { useEffect, useRef, useState } from "react";
import { REEL_H, REEL_W, drawReelFrame, loadReel, mixAudio, sceneAt, type LoadedReel } from "@/lib/reel";
import { reelReady, type BrandProfile, type PostSpec } from "@/lib/types";

/** Plays a reel in the review screen: the same drawing as the exported MP4, with sound. */
export function ReelPlayer({ spec, brand, logo }: { spec: PostSpec; brand: BrandProfile; logo: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reel = useRef<LoadedReel | null>(null);
  const audio = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode; startedAt: number } | null>(null);
  const raf = useRef(0);
  const [state, setState] = useState<"loading" | "ready" | "playing" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const ready = reelReady(spec);
  const key = JSON.stringify(spec.reel) + spec.headline + spec.kicker;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setState("loading");
    loadReel({ spec, brand, logo }).then(async (r) => {
      if (cancelled) return;
      reel.current = r;
      const first = r.scenes[0];
      if (first) { first.video.currentTime = 0.4; await new Promise((res) => first.video.addEventListener("seeked", res, { once: true })); }
      const ctx = canvas.current?.getContext("2d");
      if (ctx) drawReelFrame(ctx, r, 0.4, { spec, brand, logo });
      setState("ready");
    }).catch(() => !cancelled && setState("error"));
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  function stop() {
    cancelAnimationFrame(raf.current);
    if (audio.current) { try { audio.current.src.stop(); } catch { /* already stopped */ } void audio.current.ctx.close(); audio.current = null; }
    reel.current?.scenes.forEach((s) => s.video.pause());
  }

  async function play() {
    const r = reel.current;
    const ctx2d = canvas.current?.getContext("2d");
    if (!r || !ctx2d) return;
    stop();
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = await mixAudio(r, ctx.sampleRate);
    src.connect(ctx.destination);
    const startedAt = ctx.currentTime + 0.05;
    src.start(startedAt);
    audio.current = { ctx, src, startedAt };
    setState("playing");
    let current = -1;
    const tick = () => {
      const t = Math.max(0, ctx.currentTime - startedAt);
      if (t >= r.total) { stop(); setState("ready"); setProgress(0); return; }
      const at = sceneAt(r, t);
      if (at) {
        if (at.index !== current) {
          r.scenes.forEach((s, i) => i !== at.index && s.video.pause());
          at.scene.video.currentTime = Math.min(at.local, (at.scene.video.duration || 5) - 0.05);
          void at.scene.video.play().catch(() => undefined);
          current = at.index;
        } else if (at.local > (at.scene.video.duration || 5) - 0.06) {
          at.scene.video.pause(); // hold the last frame when the voice-over runs past the clip
        }
      }
      drawReelFrame(ctx2d, r, t, { spec, brand, logo });
      setProgress(t / r.total);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  if (!ready) {
    const first = spec.reel?.scenes.find((s) => s.image)?.image;
    const parts = spec.reel?.scenes ?? [];
    const done = parts.filter((s) => s.clip && s.voice).length;
    return (
      <div className="reel-frame reel-wait" style={first ? { backgroundImage: `url(${first})` } : undefined}>
        <div><strong>Making your reel</strong><span>{parts.length ? `${done} of ${parts.length} scenes ready` : "Starting…"}. Photos, clips and voice-overs take a few minutes.</span></div>
      </div>
    );
  }
  return (
    <div className="reel-player">
      <div className="reel-frame">
        <canvas ref={canvas} width={REEL_W} height={REEL_H} aria-label="Reel preview" />
        {state !== "playing" && (
          <button type="button" className="reel-play" onClick={play} disabled={state !== "ready"} aria-label="Play the reel with sound">
            {state === "loading" ? "Loading…" : state === "error" ? "Couldn't load" : <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}
          </button>
        )}
        {state === "playing" && <button type="button" className="reel-stop" onClick={() => { stop(); setState("ready"); }} aria-label="Stop">Stop</button>}
      </div>
      <div className="reel-bar" aria-hidden="true"><div style={{ width: `${progress * 100}%` }} /></div>
    </div>
  );
}
