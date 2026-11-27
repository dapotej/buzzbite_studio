"use client";
import { useEffect, useState } from "react";
import type { PostSpec, Slide, TemplateId } from "@/lib/types";

type TextKey = "kicker" | "headline" | "quote" | "sub" | "note" | "big" | "bigLabel" | "endline" | "cta";
const LABELS: Record<TextKey, string> = {
  kicker: "Label", headline: "Headline", quote: "Quote or post text", sub: "Line under the headline", note: "Tag line",
  big: "Big figure or title", bigLabel: "Words under the figure", endline: "Closing line", cta: "Call to action",
};
// The text each design shows. Fields with text in them are always shown too.
const USES: Record<TemplateId, TextKey[]> = {
  photo: ["kicker", "headline", "sub"], photo_band: ["kicker", "headline", "sub"], photo_frame: ["kicker", "headline", "note"],
  photo_stat: ["kicker", "big", "bigLabel", "headline"], video: ["kicker", "headline"], statement: ["kicker", "headline", "sub"],
  stat: ["kicker", "big", "headline", "sub"], list: ["kicker", "headline"], chat: ["kicker", "headline"], poster: ["big", "headline", "note"],
  motion: ["kicker", "endline", "cta"], carousel: [], reel: ["kicker", "headline"],
  quote: ["kicker", "quote", "sub"], split: ["kicker", "headline", "sub"], versus: ["kicker", "headline"], note: ["headline"], social: ["quote", "sub"],
};

/** Edits the words on a post's design. Changes preview live; Save stores them. */
export function EditText({ spec, slide, onPreview, onSave, busy }: {
  spec: PostSpec; slide: number; busy: boolean;
  onPreview: (spec: PostSpec) => void; onSave: (spec: PostSpec) => Promise<void>;
}) {
  const [draft, setDraft] = useState(spec);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(spec); }, [spec]);
  const set = (next: PostSpec) => { setDraft(next); onPreview(next); };
  const changed = JSON.stringify(draft) !== JSON.stringify(spec);

  const keys = (Object.keys(LABELS) as TextKey[]).filter((k) => USES[draft.template].includes(k) || draft[k]);
  const field = (label: string, value: string, onChange: (v: string) => void, hint?: string, rows = 1) => (
    <label className="field" key={label}>
      {label}{hint && <span className="hint">{hint}</span>}
      {rows > 1 ? <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /> : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
  const hl = "Wrap words in *asterisks* to colour them.";
  const s: Slide | undefined = draft.slides[slide];
  const setSlide = (patch: Partial<Slide>) => set({ ...draft, slides: draft.slides.map((x, i) => (i === slide ? { ...x, ...patch } : x)) });

  return (
    <div className="edit-text stack" style={{ gap: 10 }}>
      {draft.template === "carousel" && s ? (
        <>
          <p className="small muted">Slide {slide + 1} of {draft.slides.length}. Use the arrows under the post to edit another slide.</p>
          {field("Label", s.kicker, (v) => setSlide({ kicker: v }))}
          {field("Headline", s.headline, (v) => setSlide({ headline: v }), hl)}
          {field(s.layout === "cta" ? "Call to action" : "Text", s.body, (v) => setSlide({ body: v }), undefined, 3)}
          {(s.layout === "stat" || s.big) && field("Big figure", s.big, (v) => setSlide({ big: v }))}
        </>
      ) : (
        keys.map((k) => field(k === "sub" && draft.template === "quote" ? "Who said it" : LABELS[k], draft[k], (v) => set({ ...draft, [k]: v }), k === "headline" || k === "quote" ? hl : undefined, k === "quote" ? 3 : 1))
      )}
      {(draft.template === "video" || draft.template === "motion" || draft.lines.length > 0) &&
        field("Lines that appear one by one", draft.lines.join("\n"), (v) => set({ ...draft, lines: v.split("\n") }), "One per line.", 3)}
      {(["list", "versus", "note"].includes(draft.template) || draft.items.length > 0) && draft.items.map((it, i) => (
        <div className="row" key={i} style={{ gap: 8, alignItems: "flex-end" }}>
          {field(`Item ${i + 1}`, it.title, (v) => set({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, title: v } : x)) }))}
          {field("Detail", it.detail, (v) => set({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, detail: v } : x)) }))}
        </div>
      ))}
      {(draft.template === "chat" || draft.bubbles.length > 0) && draft.bubbles.map((b, i) =>
        field(b.fromCustomer ? `Message ${i + 1} (customer)` : `Message ${i + 1} (brand)`, b.text, (v) => set({ ...draft, bubbles: draft.bubbles.map((x, j) => (j === i ? { ...x, text: v } : x)) }), undefined, 2))}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ink" type="button" disabled={!changed || saving || busy}
          onClick={async () => { setSaving(true); try { await onSave({ ...draft, lines: draft.lines.map((l) => l.trim()).filter(Boolean) }); } finally { setSaving(false); } }}>
          {saving ? "Saving…" : "Save text"}
        </button>
        <button className="btn btn-ghost" type="button" disabled={!changed || saving} onClick={() => set(spec)}>Undo changes</button>
      </div>
    </div>
  );
}
