"use client";
import { useState } from "react";
import { useMedia } from "./useMedia";
import type { Media } from "@/lib/types";

export function MediaTile({ m, children }: { m: Media; children?: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="thumb" style={{ aspectRatio: "4 / 5" }}>
        {m.status === "pending" ? (
          <div className="media-pending">
            <span>{m.kind === "video" ? "Making the clip… (1-3 min)" : "Generating… (about 20 s)"}</span>
          </div>
        ) : m.kind === "video" ? (
          <video src={m.url!} muted loop playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <img src={m.url!} alt={m.description} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className="chip">{m.kind === "video" ? "Video" : "Photo"}</span>
        {m.source === "ai" && <span className="chip chip-video">AI</span>}
      </div>
      <p className="small muted" style={{ overflowWrap: "anywhere" }}>{m.description}</p>
      {children}
    </div>
  );
}

export function MediaLibrary({ brandId, initial }: { brandId: string; initial: Media[] }) {
  const lib = useMedia(brandId, initial);
  const [brief, setBrief] = useState("");
  const [motion, setMotion] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    await lib.uploadFiles(files, (name, pct) => setProgress(`${name} ${Math.round(pct)}%`));
    setProgress("");
    setBusy(null);
  }
  async function makeImage() {
    setBusy("image");
    if (await lib.generate({ kind: "image", brief })) setBrief("");
    setBusy(null);
  }
  async function animate(m: Media) {
    setBusy(m.id);
    await lib.generate({ kind: "video", brief: motion[m.id] ?? "", sourceId: m.id });
    setBusy(null);
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <section className="card stack">
          <h2>Upload photos and clips</h2>
          <p className="muted small">Your own photos and footage make the strongest posts. PNG, JPG, WebP, MP4 or MOV, up to 200 MB each.</p>
          <div className="row">
            <label className="btn btn-primary" htmlFor="media-files">{busy === "upload" ? "Uploading…" : "Choose files"}</label>
            <input id="media-files" type="file" multiple hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => onFiles(e.target.files)} disabled={busy === "upload"} />
            {progress && <span className="small muted">{progress}</span>}
          </div>
        </section>
        <section className="card stack">
          <h2>Generate an image</h2>
          <label className="field" htmlFor="gen-brief">
            Describe the picture <span className="hint">Claude turns this into a detailed prompt in your brand&rsquo;s art direction.</span>
            <textarea id="gen-brief" rows={3} value={brief} maxLength={1000} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. A taxi with a glowing roof screen on Admiralty Way at dusk" />
          </label>
          <div className="row">
            <button className="btn btn-primary" type="button" onClick={makeImage} disabled={busy !== null || brief.trim().length < 3}>
              {busy === "image" ? "Starting…" : "Generate image"}
            </button>
          </div>
        </section>
      </div>
      {lib.error && <p className="error" role="alert">{lib.error}</p>}

      {lib.items.length === 0 ? (
        <div className="empty"><strong>No media yet</strong>Upload photos or clips, or generate an image. The Photo template and Claude&rsquo;s drafts will use them.</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" }}>
          {lib.items.map((m) => (
            <MediaTile key={m.id} m={m}>
              {m.status === "ready" && m.kind === "image" && (
                <div className="stack" style={{ gap: 6 }}>
                  <input type="text" aria-label="How should it move?" placeholder="Motion, e.g. slow push-in" value={motion[m.id] ?? ""} onChange={(e) => setMotion((x) => ({ ...x, [m.id]: e.target.value }))} />
                  <button className="btn" type="button" onClick={() => animate(m)} disabled={busy !== null}>{busy === m.id ? "Starting…" : "Animate into a 5 s clip"}</button>
                </div>
              )}
              {m.status === "ready" && <button className="btn btn-ghost btn-danger" type="button" onClick={() => lib.remove(m.id)}>Delete</button>}
            </MediaTile>
          ))}
        </div>
      )}
    </div>
  );
}
