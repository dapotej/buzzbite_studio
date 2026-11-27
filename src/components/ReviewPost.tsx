"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EditText } from "./EditText";
import { ReelPlayer } from "./ReelPlayer";
import { exportReel } from "@/lib/reel";
import { ScaledPost } from "./PostThumb";
import { downloadBlob, exportMp4, exportPng, slidesPdf, slidesZip } from "@/lib/export";
import { filesReady, makePostFiles } from "@/lib/deliver";
import { ANIMATABLE, PLATFORM_NAMES, PLATFORMS, isVideoPost, type Brand, type Platform, type Post, type PostSpec, isReel, reelReady } from "@/lib/types";

const fmt = (s: string | null) => (s ? new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }) : "No date");

export function ReviewPost({ brand, post, strip, reviewCount }: { brand: Brand; post: Post | null; strip: Post[]; reviewCount: number }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<"linkedin" | "instagram">("linkedin");
  const [caption, setCaption] = useState(post?.linkedin ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [editing, setEditing] = useState(false);
  const touchX = useRef(0);
  const touchY = useRef(0);
  const [preview, setPreview] = useState<PostSpec | null>(null);
  useEffect(() => { setPreview(null); setEditing(false); }, [post?.id]);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [prep, setPrep] = useState<number | null>(null);
  const connected = PLATFORMS.filter((x) => brand.social.accounts.some((a) => a.platform === x));
  const autopost = connected.length > 0;
  useEffect(() => { setSlide(0); }, [post?.id]);

  useEffect(() => { setCaption(post?.[platform] ?? ""); }, [post, platform]);
  // While this post's photo or clip is being made, check on it.
  useEffect(() => {
    if (post?.status !== "making") return;
    const t = setTimeout(async () => { await fetch(`/api/brands/${brand.id}/advance`, { method: "POST" }).catch(() => undefined); router.refresh(); }, 6000);
    return () => clearTimeout(t);
  }, [post, brand.id, router]);

  // While a post is going out (or due), check its result until it lands.
  const pubState = post?.publishing.state;
  useEffect(() => {
    if (!post || (pubState !== "publishing" && pubState !== "scheduled")) return;
    if (pubState === "scheduled" && post.publishing.scheduledFor && new Date(post.publishing.scheduledFor + ":00Z").getTime() > Date.now() + 14 * 3600e3) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/posts/${post.id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ check: true }) }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (data && data.publishing?.state !== pubState) router.refresh();
    }, pubState === "publishing" ? 5000 : 60000);
    return () => clearInterval(t);
  }, [post, pubState, router]);

  if (!post) {
    return (
      <div className="wrap narrow">
        <h1 className="title">Nothing to review</h1>
        <p className="sub">New posts appear here when Buzzbite creates them. Go to the <Link href={`/b/${brand.id}`}>calendar</Link> to create this month&rsquo;s posts.</p>
      </div>
    );
  }
  const p = post;
  const nextInQueue = () => strip.find((x) => x.id !== p.id && x.status === "review");
  const go = (id?: string) => router.push(id ? `/b/${brand.id}/review?post=${id}` : `/b/${brand.id}/review`);

  async function patch(body: Record<string, unknown>, id = p.id): Promise<Post> {
    const res = await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Could not save.");
    return data as Post;
  }
  /** With accounts connected, approving makes the post's final files so it can be scheduled. */
  async function approveOne(x: Post, onProgress: (f: number) => void): Promise<Post> {
    if (autopost && !filesReady(brand, x)) await makePostFiles(brand, x, onProgress);
    return patch({ status: "approved" }, x.id);
  }
  async function approve() {
    setBusy("approve"); setMessage("");
    try {
      const saved = await approveOne(p, setPrep);
      if (saved.publishing.error) { setMessage(saved.publishing.error); router.refresh(); return; }
      go(nextInQueue()?.id); router.refresh();
    }
    catch (e) { setMessage(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(null); setPrep(null); }
  }
  async function approveAll() {
    setBusy("all"); setMessage("");
    if (!autopost) {
      await fetch(`/api/brands/${brand.id}/approve-all`, { method: "POST" });
    } else {
      const queue = strip.filter((x) => x.status === "review");
      const failed: string[] = [];
      for (let i = 0; i < queue.length; i++) {
        setMessage(`Preparing and scheduling post ${i + 1} of ${queue.length}… Keep this page open.`);
        try {
          const saved = await approveOne(queue[i], setPrep);
          if (saved.publishing.error) failed.push(`${fmt(saved.publish_on)}: ${saved.publishing.error}`);
        } catch (e) { failed.push(`${fmt(queue[i].publish_on)}: ${e instanceof Error ? e.message : "failed"}`); }
      }
      setPrep(null);
      if (failed.length) { setBusy(null); setMessage(`Approved, but some posts were not scheduled. ${failed.join(" ")}`); router.refresh(); return; }
    }
    setBusy(null); router.push(`/b/${brand.id}`); router.refresh();
  }
  async function publish(opts: { now?: boolean } = {}) {
    if (opts.now) {
      const to = (p.publishing.targets ?? connected).map((x) => {
        const a = brand.social.accounts.find((acc) => acc.platform === x);
        return `${PLATFORM_NAMES[x]}: ${a?.name ?? ""}${a?.username ? ` (@${a.username})` : ""}`;
      });
      if (!window.confirm(`Post this now?\n\n${to.join("\n")}\n\nIt goes live straight away.`)) return;
    }
    setBusy(opts.now ? "now" : "schedule"); setMessage("");
    try {
      if (!filesReady(brand, p)) await makePostFiles(brand, p, setPrep);
      const res = await fetch(`/api/posts/${p.id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(opts) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not schedule the post.");
      if (data.publishing?.error) setMessage(data.publishing.error);
      router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not schedule the post."); }
    finally { setBusy(null); setPrep(null); }
  }
  async function unapprove() {
    setBusy("unapprove");
    try { await patch({ status: "review" }); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not cancel."); }
    finally { setBusy(null); }
  }
  async function toggleTarget(x: Platform) {
    const cur = p.publishing.targets ?? connected;
    const next = cur.includes(x) ? cur.filter((t) => t !== x) : [...cur, x];
    if (!next.length) return setMessage("Choose at least one place to post.");
    try { await patch({ targets: next }); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save."); }
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
  /** Renders every carousel slide in turn and returns them as PNGs. */
  async function renderSlides(): Promise<Blob[]> {
    const count = Math.max(1, p.spec.slides.length);
    const out: Blob[] = [];
    for (let i = 0; i < count; i++) {
      setSlide(i);
      await new Promise((r) => setTimeout(r, 250));
      const n = canvasRef.current?.firstElementChild as HTMLElement | null;
      if (!n) throw new Error("Could not draw the slides.");
      out.push(await exportPng(n));
      setExporting((i + 1) / count);
    }
    setSlide(0);
    return out;
  }
  async function downloadCarousel(kind: "zip" | "pdf") {
    const base = `${brand.name}-${p.publish_on ?? p.id.slice(0, 8)}`.replace(/\W+/g, "-").toLowerCase();
    setMessage(""); setExporting(0);
    try {
      const pngs = await renderSlides();
      if (kind === "zip") downloadBlob(await slidesZip(pngs, base), `${base}-slides.zip`);
      else downloadBlob(await slidesPdf(pngs), `${base}-carousel.pdf`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not create the file."); }
    finally { setExporting(null); }
  }
  async function download() {
    const base = `${brand.name}-${p.publish_on ?? p.id.slice(0, 8)}`.replace(/\W+/g, "-").toLowerCase();
    if (isReel(p.spec)) {
      if (!reelReady(p.spec)) return setMessage("The reel is still being made.");
      setMessage(""); setExporting(0);
      try {
        const { blob, audio } = await exportReel({ spec: p.spec, brand: brand.profile, logo: brand.logo_on_dark ?? brand.logo_on_light }, setExporting);
        downloadBlob(blob, `${base}-reel.mp4`);
        if (audio !== "aac") setMessage("This browser recorded the sound in a format Instagram may not accept. For posting, download from Chrome or Safari.");
      }
      catch (e) { setMessage(e instanceof Error ? e.message : "Could not create the reel."); }
      finally { setExporting(null); }
      return;
    }
    const n = canvasRef.current?.firstElementChild as HTMLElement | null;
    if (!n) return;
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
  const approveDisabled = busy !== null || making || p.status === "approved" || p.status === "posted";
  const approveLabel = p.status === "posted" ? "Posted" : p.status === "approved" ? (autopost && p.publishing.state === "scheduled" ? "Scheduled" : "Approved")
    : busy === "approve" ? (prep !== null ? `Preparing ${Math.round(prep * 100)}%` : "Approving…") : autopost ? "Approve & schedule" : "Approve";
  // Swipe left or right on the post to move through the queue (phones).
  const idx = strip.findIndex((x) => x.id === p.id);
  const neighbour = (d: 1 | -1) => strip[idx + d]?.id;
  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1 className="title">{reviewCount ? `${reviewCount} post${reviewCount === 1 ? "" : "s"} to review` : "Everything's approved"}</h1>
          <p className="sub">Approve each post, or tell Buzzbite what to change. Approved posts are ready to go out on their date.</p>
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
        <div className="stage" onTouchStart={(e) => { touchX.current = e.touches[0].clientX; touchY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touchX.current, dy = e.changedTouches[0].clientY - touchY.current;
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || busy !== null) return;
            if (p.spec.template === "carousel" && p.spec.slides.length > 1) {
              const next = slide + (dx < 0 ? 1 : -1);
              if (next >= 0 && next < p.spec.slides.length) return setSlide(next);
            }
            const id = neighbour(dx < 0 ? 1 : -1);
            if (id) go(id);
          }}>
          <div className="stage-col">
            {isReel(p.spec) ? <ReelPlayer spec={preview ?? p.spec} brand={brand.profile} logo={brand.logo_on_dark ?? brand.logo_on_light} /> : <ScaledPost key={p.id + p.updated_at} brand={brand.profile} spec={preview ?? p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} canvasRef={canvasRef} slide={slide} badge={false} />}
            {p.spec.template === "carousel" && p.spec.slides.length > 1 && (
              <div className="slides-nav">
                <button className="btn btn-ghost" type="button" onClick={() => setSlide((s) => Math.max(0, s - 1))} disabled={slide === 0} aria-label="Previous slide">←</button>
                <div className="dots">{p.spec.slides.map((_, i) => <button key={i} type="button" aria-label={`Slide ${i + 1}`} aria-current={i === slide} onClick={() => setSlide(i)} />)}</div>
                <button className="btn btn-ghost" type="button" onClick={() => setSlide((s) => Math.min(p.spec.slides.length - 1, s + 1))} disabled={slide === p.spec.slides.length - 1} aria-label="Next slide">→</button>
              </div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="chip">{fmt(p.publish_on)} · {brand.settings.time}</span>
            <span className={`chip ${p.status === "approved" || p.status === "posted" ? "chip-ok" : making ? "chip-making" : "chip-wait"}`}>
              {p.status === "posted" ? "Posted" : p.status === "approved" ? (p.publishing.state === "scheduled" ? "Scheduled" : "Approved") : making ? "Creating photo or video…" : "To review"}
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
            <button className="btn btn-ok btn-lg" type="button" onClick={approve} disabled={approveDisabled}>{approveLabel}</button>
            <button className="btn btn-lg" type="button" onClick={() => go(nextInQueue()?.id)} disabled={!nextInQueue()}>Next post</button>
          </div>
          <PublishPanel brand={brand} post={p} connected={connected} busy={busy} prep={prep} onToggle={toggleTarget} onPublish={publish} onUnapprove={unapprove} />
          <div className="quick">
            <button type="button" aria-pressed={editing} disabled={busy !== null || making} onClick={() => { setEditing(!editing); setPreview(null); }}>{editing ? "Close text editor" : "Edit text"}</button>
            {ANIMATABLE.has(p.spec.template) && (
              <button type="button" aria-pressed={!!p.spec.animated} disabled={busy !== null || making} onClick={async () => {
                try {
                  const saved = await patch({ spec: { ...p.spec, animated: !p.spec.animated } });
                  setMessage(saved.spec.animated ? "Now an animation: it goes out as a short video." : "Now a still image.");
                  router.refresh();
                } catch (e) { setMessage(e instanceof Error ? e.message : "Could not change it."); }
              }}>{p.spec.animated ? "Make it still" : "Animate it"}</button>
            )}
            {[["new_photo", "New photo"], ["make_video", "Make it a video"], ["make_carousel", "Make it a carousel"], ["make_reel", "Make it a reel"], ["shorter", "Shorter caption"], ["different_design", "Different design"]].filter(([a]) => !(a === "make_carousel" && p.spec.template === "carousel") && !(a === "make_video" && isVideoPost(p.spec)) && !(a === "make_reel" && p.spec.template === "reel")).map(([a, label]) => (
              <button key={a} type="button" disabled={busy !== null || making} onClick={() => revise({ action: a }, a)}>{busy === a ? "Working…" : label}</button>
            ))}
          </div>
          {editing && (
            <EditText spec={p.spec} slide={slide} busy={busy !== null} onPreview={setPreview}
              onSave={async (spec) => {
                try {
                  const saved = await patch({ spec });
                  setPreview(null); setEditing(false);
                  setMessage(p.status === "approved" && saved.status === "review" ? "Text saved. The post is back in review: approve it again to schedule it." : "Text saved.");
                  router.refresh();
                } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save the text."); }
              }} />
          )}
          <form className="ask" onSubmit={(e) => { e.preventDefault(); if (ask.trim().length > 2) revise({ instruction: ask.trim() }, "ask"); }}>
            <input type="text" aria-label="Ask Buzzbite to change this post" placeholder="Or say what to change…" value={ask} onChange={(e) => setAsk(e.target.value)} disabled={busy !== null} />
            <button className="btn btn-ink" type="submit" disabled={busy !== null || ask.trim().length < 3}>{busy === "ask" ? "Changing…" : "Change"}</button>
          </form>
          {message && <p className="notice" role="status">{message}</p>}
          <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            {p.spec.template === "carousel" ? (
              <>
                <button className="btn" type="button" onClick={() => downloadCarousel("zip")} disabled={exporting !== null || making}>
                  {exporting !== null ? `Preparing ${Math.round(exporting * 100)}%` : "Slides for Instagram (ZIP)"}
                </button>
                <button className="btn" type="button" onClick={() => downloadCarousel("pdf")} disabled={exporting !== null || making}>PDF for LinkedIn</button>
              </>
            ) : (
              <button className="btn" type="button" onClick={download} disabled={exporting !== null || making}>
                {exporting !== null ? `Recording ${Math.round(exporting * 100)}%` : isVideoPost(p.spec) ? "Download MP4" : "Download image"}
              </button>
            )}
            <span className="spacer" />
            <button className="btn btn-ghost btn-danger" type="button" onClick={remove}>{busy === "confirm-delete" ? "Click again to delete" : "Delete"}</button>
          </div>
        </div>
      </div>
      {/* Phones: the decision stays under your thumb while you look at the post. */}
      <div className="mobile-actions">
        <button className="btn btn-ok btn-lg" type="button" onClick={approve} disabled={approveDisabled}>{approveLabel}</button>
        <button className="btn btn-lg" type="button" onClick={() => go(nextInQueue()?.id)} disabled={!nextInQueue()} aria-label="Next post">Next</button>
      </div>
    </div>
  );
}

function PublishPanel({ brand, post: p, connected, busy, prep, onToggle, onPublish, onUnapprove }: {
  brand: Brand; post: Post; connected: Platform[]; busy: string | null; prep: number | null;
  onToggle: (x: Platform) => void; onPublish: (opts?: { now?: boolean }) => void; onUnapprove: () => void;
}) {
  if (!connected.length) {
    return <p className="small muted">To post automatically, connect Instagram or LinkedIn in the <Link href={`/b/${brand.id}/kit#accounts`}>Brand kit</Link>.</p>;
  }
  const pub = p.publishing;
  const pct = prep !== null ? ` ${Math.round(prep * 100)}%` : "";
  const handle = (x: Platform) => { const a = brand.social.accounts.find((acc) => acc.platform === x); return a ? (a.username ? `@${a.username}` : a.name) : ""; };
  const nowBtn = (
    <button className="btn" type="button" onClick={() => onPublish({ now: true })} disabled={busy !== null || p.status === "making"}>
      {busy === "now" ? `Posting${pct}…` : "Post now"}
    </button>
  );
  const targets = pub.targets ?? connected;
  const working = busy === "schedule" || busy === "now";
  const when = pub.scheduledFor ? `${fmt(pub.scheduledFor.slice(0, 10))} at ${pub.scheduledFor.slice(11, 16)}` : "";
  return (
    <div className="publish">
      <div className="row" style={{ gap: 8 }}>
        <span className="small" style={{ fontWeight: 600 }}>Post to</span>
        {connected.map((x) => (
          <button key={x} type="button" className="target" aria-pressed={targets.includes(x)} onClick={() => onToggle(x)} disabled={busy !== null || p.status === "posted"}>
            {PLATFORM_NAMES[x]}{handle(x) && <span className="handle"> {handle(x)}</span>}
          </button>
        ))}
      </div>
      {p.status === "posted" || pub.state === "published" || pub.state === "partial" ? (
        <p className="small">
          Posted{pub.state === "partial" ? " to some platforms" : ""}.{" "}
          {PLATFORMS.filter((x) => pub.urls[x]).map((x) => <a key={x} href={pub.urls[x]} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>View on {PLATFORM_NAMES[x]} ↗</a>)}
          {pub.error && <span className="error"> {pub.error}</span>}
        </p>
      ) : p.status !== "approved" ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="small muted" style={{ flex: 1 }}>Approving schedules it for {fmt(p.publish_on)} at {brand.settings.time}.</span>
          {nowBtn}
        </div>
      ) : pub.state === "failed" || pub.error ? (
        <div className="issue" role="alert">
          <span>{pub.error ?? "The post could not be published."}</span>
          <span className="row" style={{ gap: 6 }}>
            {!/passed/.test(pub.error ?? "") && <button className="btn" type="button" onClick={() => onPublish()} disabled={busy !== null}>{busy === "schedule" ? `Trying${pct}…` : "Try again"}</button>}
            {nowBtn}
          </span>
        </div>
      ) : pub.state === "scheduled" ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="small" style={{ flex: 1 }}>
            Scheduled for {when}.{" "}
            <button className="linklike" type="button" onClick={onUnapprove} disabled={busy !== null}>{busy === "unapprove" ? "Cancelling…" : "Cancel"}</button>
          </span>
          {nowBtn}
        </div>
      ) : pub.state === "publishing" ? (
        <p className="small">Posting now…</p>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <span className="small muted">Approved, not scheduled yet.</span>
          <button className="btn" type="button" onClick={() => onPublish()} disabled={busy !== null}>{working && busy === "schedule" ? `Scheduling${pct}…` : "Schedule"}</button>
          {nowBtn}
        </div>
      )}
    </div>
  );
}
