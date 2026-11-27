"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ScaledPost } from "./PostThumb";
import { downloadBlob, exportMp4, exportPng } from "@/lib/export";
import { isVideoPost, type Brand, type Post } from "@/lib/types";

const fmt = (s: string | null) => (s ? new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }) : "No date");

export function ReviewPost({ brand, post, strip, reviewCount }: { brand: Brand; post: Post | null; strip: Post[]; reviewCount: number }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<"linkedin" | "instagram">("linkedin");
  const [caption, setCaption] = useState(post?.linkedin ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCaption(post?.[platform] ?? ""); }, [post, platform]);
  // While this post's photo or clip is being made, check on it.
  useEffect(() => {
    if (post?.status !== "making") return;
    const t = setTimeout(async () => { await fetch(`/api/brands/${brand.id}/advance`, { method: "POST" }).catch(() => undefined); router.refresh(); }, 6000);
    return () => clearTimeout(t);
  }, [post, brand.id, router]);

  if (!post) {
    return (
      <div className="wrap narrow">
        <h1 className="title">Nothing to review</h1>
        <p className="sub">New posts appear here when SocialPilot creates them. Go to the <Link href={`/b/${brand.id}`}>calendar</Link> to create this month&rsquo;s posts.</p>
      </div>
    );
  }
  const p = post;
  const nextInQueue = () => strip.find((x) => x.id !== p.id && x.status === "review");
  const go = (id?: string) => router.push(id ? `/b/${brand.id}/review?post=${id}` : `/b/${brand.id}/review`);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/posts/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save.");
  }
  async function approve() {
    setBusy("approve");
    try { await patch({ status: "approved" }); const n = nextInQueue(); go(n?.id); router.refresh(); }
    catch (e) { setMessage(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(null); }
  }
  async function approveAll() {
    setBusy("all");
    await fetch(`/api/brands/${brand.id}/approve-all`, { method: "POST" });
    setBusy(null); router.push(`/b/${brand.id}`); router.refresh();
  }
  async function revise(body: { action?: string; instruction?: string }, label: string) {
    setBusy(label); setMessage("");
    const res = await fetch(`/api/posts/${p.id}/revise`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMessage(data.error ?? "Could not change the post.");
    setAsk("");
    setMessage(data.status === "making" ? "Updated. The new photo or video is being made; it appears here in a minute or two." : "Updated.");
    router.refresh();
  }
  async function retryMedia() {
    setBusy("retry"); setMessage("");
    const res = await fetch(`/api/posts/${p.id}/retry-media`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMessage(data.error ?? "Could not try again.");
    if (!data.issue) setMessage("Trying again. The photo or video appears here in a minute or two.");
    router.refresh();
  }
  async function saveCaption() {
    if (caption === p[platform]) return;
    try { await patch({ [platform]: caption }); setMessage("Caption saved."); router.refresh(); } catch { setMessage("Could not save the caption."); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(caption); setMessage("Caption copied."); } catch { setMessage("Select the caption and copy it."); }
  }
  async function download() {
    const n = canvasRef.current?.firstElementChild as HTMLElement | null;
    if (!n) return;
    const base = `${brand.name}-${p.publish_on ?? p.id.slice(0, 8)}`.replace(/\W+/g, "-").toLowerCase();
    setMessage("");
    try {
      if (isVideoPost(p.spec)) {
        setExporting(0);
        const { blob, codec } = await exportMp4(n, setExporting);
        downloadBlob(blob, `${base}.mp4`);
        if (!codec.startsWith("avc")) setMessage("This browser made a VP9 video. For Instagram, download from Chrome or Safari.");
      } else downloadBlob(await exportPng(n), `${base}.png`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not create the file."); }
    finally { setExporting(null); }
  }
  async function remove() {
    if (busy !== "confirm-delete") return setBusy("confirm-delete");
    await fetch(`/api/posts/${p.id}`, { method: "DELETE" });
    setBusy(null); go(nextInQueue()?.id); router.refresh();
  }

  const making = p.status === "making";
  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1 className="title">{reviewCount ? `${reviewCount} post${reviewCount === 1 ? "" : "s"} to review` : "Everything's approved"}</h1>
          <p className="sub">Approve each post, or tell SocialPilot what to change. Approved posts are ready to go out on their date.</p>
        </div>
        {reviewCount > 1 && <button className="btn" type="button" onClick={approveAll} disabled={busy !== null}>{busy === "all" ? "Approving…" : `Approve all ${reviewCount}`}</button>}
      </div>

      {strip.length > 1 && (
        <div className="strip" aria-label="Posts">
          {strip.map((x) => (
            <Link key={x.id} href={`/b/${brand.id}/review?post=${x.id}`} aria-current={x.id === p.id} aria-label={fmt(x.publish_on)}>
              <ScaledPost brand={brand.profile} spec={x.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} badge={false} />
              {x.status === "approved" && <span className="dot-ok" aria-hidden="true" />}
            </Link>
          ))}
        </div>
      )}

      <div className="review">
        <div className="stage">
          <ScaledPost key={p.id + p.updated_at} brand={brand.profile} spec={p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} canvasRef={canvasRef} />
        </div>
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="chip">{fmt(p.publish_on)} · {brand.settings.time}</span>
            <span className={`chip ${p.status === "approved" ? "chip-ok" : making ? "chip-making" : "chip-wait"}`}>
              {p.status === "approved" ? "Approved" : making ? "Creating photo or video…" : "To review"}
            </span>
          </div>
          <h2 style={{ fontSize: 23 }}>{p.title || p.spec.headline.replace(/\*/g, "")}</h2>
          {p.issue && (
            <div className="issue" role="alert">
              <span>{p.issue}</span>
              <button className="btn" type="button" onClick={retryMedia} disabled={busy !== null}>{busy === "retry" ? "Trying again…" : "Try again"}</button>
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <span className="ch ch-in">in</span><span className="ch ch-ig">IG</span>
            <span className="seg" role="group" aria-label="Caption">
              <button type="button" aria-pressed={platform === "linkedin"} onClick={() => setPlatform("linkedin")}>LinkedIn</button>
              <button type="button" aria-pressed={platform === "instagram"} onClick={() => setPlatform("instagram")}>Instagram</button>
            </span>
            <span className="spacer" />
            <button className="btn btn-ghost" type="button" onClick={copy}>Copy</button>
          </div>
          <textarea className="caption" aria-label={`${platform} caption`} value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={saveCaption} rows={9} />
          <div className="decide">
            <button className="btn btn-ok btn-lg" type="button" onClick={approve} disabled={busy !== null || p.status === "approved"}>
              {p.status === "approved" ? "Approved" : busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button className="btn btn-lg" type="button" onClick={() => go(nextInQueue()?.id)} disabled={!nextInQueue()}>Next post</button>
          </div>
          <div className="quick">
            {[["new_photo", "New photo"], ["make_video", "Make it a video"], ["shorter", "Shorter caption"], ["different_design", "Different design"]].map(([a, label]) => (
              <button key={a} type="button" disabled={busy !== null || making} onClick={() => revise({ action: a }, a)}>{busy === a ? "Working…" : label}</button>
            ))}
          </div>
          <form className="ask" onSubmit={(e) => { e.preventDefault(); if (ask.trim().length > 2) revise({ instruction: ask.trim() }, "ask"); }}>
            <input type="text" aria-label="Ask SocialPilot to change this post" placeholder="Or say what to change…" value={ask} onChange={(e) => setAsk(e.target.value)} disabled={busy !== null} />
            <button className="btn btn-ink" type="submit" disabled={busy !== null || ask.trim().length < 3}>{busy === "ask" ? "Changing…" : "Change"}</button>
          </form>
          {message && <p className="notice" role="status">{message}</p>}
          <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <button className="btn" type="button" onClick={download} disabled={exporting !== null || making}>
              {exporting !== null ? `Recording ${Math.round(exporting * 100)}%` : isVideoPost(p.spec) ? "Download MP4" : "Download image"}
            </button>
            <span className="spacer" />
            <button className="btn btn-ghost btn-danger" type="button" onClick={remove}>{busy === "confirm-delete" ? "Click again to delete" : "Delete"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
