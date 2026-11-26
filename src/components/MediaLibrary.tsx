"use client";
import { useState } from "react";
import { useMedia } from "./useMedia";
import type { Brand, Media } from "@/lib/types";

export function MediaLibrary({ brand, initial }: { brand: Brand; initial: Media[] }) {
  const lib = useMedia(brand.id, initial);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    await lib.uploadFiles(files, (name, pct) => setProgress(`${name} ${Math.round(pct)}%`));
    setProgress(""); setBusy(null);
  }
  async function makePhoto(e: React.FormEvent) {
    e.preventDefault();
    setBusy("image");
    if (await lib.generate({ kind: "image", brief })) setBrief("");
    setBusy(null);
  }
  async function animate(m: Media) {
    setBusy(m.id);
    await lib.generate({ kind: "video", brief: "", sourceId: m.id });
    setBusy(null);
  }

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1 className="title">Photos &amp; video</h1>
          <p className="sub">Everything SocialPilot makes for {brand.name}&rsquo;s posts, plus your own uploads. Your own photos and clips make the strongest posts.</p>
        </div>
        <label className="btn" htmlFor="media-files">{busy === "upload" ? "Uploading…" : "Upload photos or clips"}</label>
        <input id="media-files" type="file" multiple hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => onFiles(e.target.files)} disabled={busy === "upload"} />
      </div>
      <form className="card gen" onSubmit={makePhoto}>
        <input type="text" aria-label="Describe a photo" value={brief} maxLength={1000} onChange={(e) => setBrief(e.target.value)} placeholder="Describe a photo, e.g. a busy airport arrivals hall at dusk" />
        <button className="btn btn-ink" type="submit" disabled={busy !== null || brief.trim().length < 3}>{busy === "image" ? "Starting…" : "Create photo"}</button>
      </form>
      {progress && <p className="small muted">{progress}</p>}
      {lib.error && <p className="error" role="alert">{lib.error}</p>}
      {lib.items.length === 0 ? (
        <div className="empty"><strong>Nothing here yet</strong>Photos and videos appear here as SocialPilot creates posts. You can also upload your own.</div>
      ) : (
        <div className="lib">
          {lib.items.map((m) => (
            <div key={m.id} className="tile">
              {m.status === "pending" ? (
                <div className="pic pending">{m.kind === "video" ? "Making the video… (1–3 min)" : "Creating the photo… (about 20 s)"}</div>
              ) : m.kind === "video" ? (
                <video className="pic" src={m.url!} muted loop playsInline autoPlay />
              ) : (
                <img className="pic" src={m.url!} alt={m.description} />
              )}
              <div className="row" style={{ gap: 6 }}>
                <span className="chip">{m.kind === "video" ? "Video" : "Photo"}</span>
                <span className="chip">{m.source === "ai" ? "AI" : "Upload"}</span>
                {m.post_id && <span className="chip chip-acc">In a post</span>}
              </div>
              <p title={m.description}>{m.description}</p>
              {m.status === "ready" && (
                <div className="row" style={{ gap: 4 }}>
                  {m.kind === "image" && <button className="btn btn-ghost" type="button" onClick={() => animate(m)} disabled={busy !== null}>{busy === m.id ? "Starting…" : "Make video"}</button>}
                  {!m.post_id && <button className="btn btn-ghost btn-danger" type="button" onClick={() => lib.remove(m.id)}>Delete</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
