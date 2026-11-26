"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ScaledPost } from "./PostThumb";
import { downloadBlob, exportMp4, exportPng } from "@/lib/export";
import { TEMPLATES, TEMPLATE_IDS, type Brand, type Post, type PostSpec, type TemplateId } from "@/lib/types";

type Saved = "saved" | "saving" | "unsaved" | "error";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Fields each template shows in the editor. */
const FIELDS: Record<TemplateId, (keyof PostSpec)[]> = {
  statement: ["kicker", "headline", "sub"],
  stat: ["kicker", "big", "headline", "sub"],
  list: ["kicker", "headline", "items"],
  chat: ["bubbles", "headline"],
  motion: ["kicker", "lines", "endline", "cta"],
};

export function PostEditor({ brand, initial }: { brand: Brand; initial: Post }) {
  const router = useRouter();
  const [post, setPost] = useState(initial);
  const [saved, setSaved] = useState<Saved>("saved");
  const [platform, setPlatform] = useState<"linkedin" | "instagram">("linkedin");
  const [instruction, setInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [replay, setReplay] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(post);
  latest.current = post;

  // Autosave shortly after the last change.
  function change(patch: Partial<Post>) {
    setPost((p) => ({ ...p, ...patch }));
    setSaved("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  }
  const setSpec = (patch: Partial<PostSpec>) => change({ spec: { ...latest.current.spec, ...patch } });

  async function save() {
    const p = latest.current;
    setSaved("saving");
    const res = await fetch(`/api/posts/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: p.spec, linkedin: p.linkedin, instagram: p.instagram, status: p.status, publish_on: p.publish_on }),
    });
    setSaved(res.ok ? "saved" : "error");
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function revise() {
    if (instruction.trim().length < 3) return;
    setRevising(true);
    setMessage("");
    const res = await fetch(`/api/posts/${post.id}/revise`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction }) });
    const data = await res.json().catch(() => ({}));
    setRevising(false);
    if (!res.ok) return setMessage(data.error ?? "Could not revise the post.");
    setPost(data);
    setInstruction("");
    setReplay((r) => r + 1);
  }

  const node = () => canvasRef.current?.firstElementChild as HTMLElement | null;
  const base = `${brand.name}-${post.publish_on ?? post.id.slice(0, 8)}`.replace(/\W+/g, "-").toLowerCase();

  async function downloadImage() {
    const n = node();
    if (!n) return;
    setMessage("");
    try {
      // For video posts the image is the frame where the message is fully on screen.
      if (post.spec.template === "motion") {
        for (const a of n.getAnimations({ subtree: true })) { a.pause(); a.currentTime = 5200; }
      }
      downloadBlob(await exportPng(n), `${base}.png`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create the image.");
    } finally {
      if (post.spec.template === "motion") for (const a of n.getAnimations({ subtree: true })) a.play();
    }
  }

  async function downloadVideo() {
    const n = node();
    if (!n) return;
    setMessage("");
    setExporting(0);
    try {
      const { blob, codec } = await exportMp4(n, setExporting);
      downloadBlob(blob, `${base}.mp4`);
      if (!codec.startsWith("avc")) setMessage("This browser could only make a VP9 video. For Instagram, export from Chrome or Safari to get H.264.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create the video.");
    } finally {
      setExporting(null);
    }
  }

  async function copyCaption() {
    const text = post[platform];
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Caption copied.");
    } catch {
      setMessage("Select the caption and copy it with Ctrl+C.");
    }
  }

  async function remove() {
    await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    router.push(`/brands/${brand.id}`);
  }

  const spec = post.spec;
  const isVideo = TEMPLATES[spec.template].video;
  const words = post[platform].trim() ? post[platform].trim().split(/\s+/).length : 0;

  return (
    <>
      <div className="head">
        <div>
          <Link href={`/brands/${brand.id}`} className="small muted">← {brand.name}</Link>
          <h1 style={{ marginTop: 4 }}>{spec.headline.replace(/\*/g, "") || "Untitled post"}</h1>
        </div>
        <span className="small muted" role="status">
          {saved === "saving" ? "Saving…" : saved === "unsaved" ? "Unsaved changes" : saved === "error" ? "Could not save. Check your connection." : "All changes saved"}
        </span>
      </div>

      <div className="editor">
        <div className="preview-sticky">
          <ScaledPost brand={brand.profile} spec={spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} canvasRef={canvasRef} replayKey={replay} />
          <div className="row">
            {isVideo && <button className="btn" type="button" onClick={() => setReplay((r) => r + 1)}>Replay</button>}
            {isVideo && (
              <button className="btn btn-primary" type="button" onClick={downloadVideo} disabled={exporting !== null}>
                {exporting !== null ? `Recording ${Math.round(exporting * 100)}%` : "Download video (MP4)"}
              </button>
            )}
            <button className={`btn ${isVideo ? "" : "btn-primary"}`} type="button" onClick={downloadImage} disabled={exporting !== null}>
              {isVideo ? "Download cover (PNG)" : "Download image (PNG)"}
            </button>
          </div>
          {exporting !== null && <div className="progress" aria-hidden="true"><div style={{ width: `${exporting * 100}%` }} /></div>}
          {message && <p className="small" role="status">{message}</p>}
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <section className="card stack">
            <h2>Ask Claude to change it</h2>
            <div className="row" style={{ alignItems: "stretch" }}>
              <input type="text" aria-label="What should change?" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && revise()} placeholder="e.g. Make it about Abuja airport, and punchier" style={{ flex: 1, minWidth: 220 }} />
              <button className="btn btn-primary" type="button" onClick={revise} disabled={revising || instruction.trim().length < 3}>
                {revising ? "Rewriting…" : "Rewrite"}
              </button>
            </div>
          </section>

          <section className="card stack">
            <h2>Design</h2>
            <div className="seg" role="group" aria-label="Template">
              {TEMPLATE_IDS.map((t) => (
                <button key={t} type="button" aria-pressed={spec.template === t} onClick={() => { setSpec({ template: t }); setReplay((r) => r + 1); }} title={TEMPLATES[t].description}>
                  {TEMPLATES[t].name}
                </button>
              ))}
            </div>
            {spec.template !== "motion" && (
              <div className="seg" role="group" aria-label="Background">
                {(["light", "dark"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={spec.theme === t} onClick={() => setSpec({ theme: t })}>{t === "light" ? "Light" : "Dark"}</button>
                ))}
              </div>
            )}
            <p className="small muted">Wrap words in *asterisks* to highlight them in your accent colour.</p>
            {FIELDS[spec.template].map((f) => (
              <Field key={`${f}-${replay}`} field={f} spec={spec} onChange={setSpec} />
            ))}
          </section>

          <section className="card stack">
            <div className="row">
              <h2>Captions</h2>
              <span className="spacer" />
              <div className="seg" role="group" aria-label="Platform">
                <button type="button" aria-pressed={platform === "linkedin"} onClick={() => setPlatform("linkedin")}>LinkedIn</button>
                <button type="button" aria-pressed={platform === "instagram"} onClick={() => setPlatform("instagram")}>Instagram</button>
              </div>
            </div>
            <textarea id="caption" aria-label={`${platform} caption`} rows={12} value={post[platform]} onChange={(e) => change({ [platform]: e.target.value } as Partial<Post>)} />
            <div className="row">
              <span className="small muted">{words} words</span>
              <span className="spacer" />
              <button className="btn" type="button" onClick={copyCaption}>Copy caption</button>
            </div>
          </section>

          <section className="card stack">
            <h2>Schedule</h2>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="field" htmlFor="publish" style={{ minWidth: 180 }}>
                Publish on
                <input id="publish" type="date" value={post.publish_on ?? ""} onChange={(e) => change({ publish_on: e.target.value || null })} />
              </label>
              <div className="seg" role="group" aria-label="Status">
                {(["draft", "approved", "posted"] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={post.status === s} onClick={() => change({ status: s })}>{s[0].toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
            </div>
          </section>

          <div className="row">
            <span className="spacer" />
            <button className="btn btn-danger btn-ghost" type="button" onClick={remove}>Delete post</button>
          </div>
        </div>
      </div>
    </>
  );
}

const LABELS: Partial<Record<keyof PostSpec, [string, string?]>> = {
  kicker: ["Label", "1-4 words above the headline"],
  headline: ["Headline", "Six words or fewer works best"],
  sub: ["Supporting line", "Optional"],
  big: ["Big number", "Use a real figure from your brand facts"],
  endline: ["End card headline"],
  cta: ["Call to action"],
  lines: ["Animated lines", "One per line, 2-3 lines"],
  items: ["Points", "One per line, as Title: detail"],
  bubbles: ["Chat messages", "One per line. Start a customer's message with > "],
};

function Field({ field, spec, onChange }: { field: keyof PostSpec; spec: PostSpec; onChange: (p: Partial<PostSpec>) => void }) {
  const [label, hint] = LABELS[field] ?? [field];
  const id = `f-${field}`;
  // List fields are edited as text, one entry per line; keep the raw text while typing.
  const toText = () =>
    field === "lines" ? spec.lines.join("\n")
    : field === "items" ? spec.items.map((i) => (i.detail ? `${i.title}: ${i.detail}` : i.title)).join("\n")
    : field === "bubbles" ? spec.bubbles.map((b) => (b.fromCustomer ? `> ${b.text}` : b.text)).join("\n")
    : "";
  const [raw, setRaw] = useState(toText);
  const isList = field === "lines" || field === "items" || field === "bubbles";

  function setList(text: string) {
    setRaw(text);
    if (field === "lines") onChange({ lines: lines(text) });
    if (field === "items")
      onChange({ items: lines(text).map((l) => { const i = l.indexOf(":"); return i > 0 ? { title: l.slice(0, i).trim(), detail: l.slice(i + 1).trim() } : { title: l, detail: "" }; }) });
    if (field === "bubbles") onChange({ bubbles: lines(text).map((l) => (l.startsWith(">") ? { fromCustomer: true, text: l.slice(1).trim() } : { fromCustomer: false, text: l })) });
  }

  return (
    <label className="field" htmlFor={id}>
      {label}
      {hint && <span className="hint">{hint}</span>}
      {isList ? (
        <textarea id={id} rows={5} value={raw} onChange={(e) => setList(e.target.value)} />
      ) : (
        <input id={id} type="text" value={String(spec[field] ?? "")} onChange={(e) => onChange({ [field]: e.target.value } as Partial<PostSpec>)} />
      )}
    </label>
  );
}
