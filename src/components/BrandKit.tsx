"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoToDataUrl, whiteVersion } from "./logo";
import { ScaledPost } from "./PostThumb";
import type { Brand, BrandProfile, PostSpec } from "@/lib/types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const pairsToText = (p: { name: string; description: string }[]) => p.map((x) => (x.description ? `${x.name}: ${x.description}` : x.name)).join("\n");
const textToPairs = (s: string) => lines(s).map((l) => { const i = l.indexOf(":"); return i > 0 ? { name: l.slice(0, i).trim(), description: l.slice(i + 1).trim() } : { name: l, description: "" }; });

const SAMPLE: PostSpec = {
  template: "statement", theme: "dark", kicker: "Preview", headline: "Your brand, *on autopilot.*", sub: "", note: "", big: "", bigLabel: "",
  items: [], bubbles: [], lines: [], endline: "", cta: "", imagePrompt: "", motionPrompt: "", media: null, clip: null,
};

/** Logo upload with an automatic white version for dark backgrounds. */
export function LogoUpload({ colors, light, dark, onChange }: {
  colors: BrandProfile["colors"]; light: string | null; dark: string | null; onChange: (v: { light: string | null; dark: string | null }) => void;
}) {
  const [error, setError] = useState("");
  const [over, setOver] = useState<string | null>(null);
  async function take(which: "light" | "dark", file?: File) {
    if (!file) return;
    setError("");
    try {
      const url = await logoToDataUrl(file);
      if (which === "light") onChange({ light: url, dark: dark ?? (await whiteVersion(url)) });
      else onChange({ light, dark: url });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read that file."); }
  }
  const box = (which: "light" | "dark", label: string, bg: string, value: string | null) => (
    <div className="stack" style={{ gap: 8 }}>
      <span className="small" style={{ fontWeight: 600 }}>{label}</span>
      <label htmlFor={`logo-${which}`} className={`logo-drop ${over === which ? "over" : ""}`} style={{ background: bg }}
        onDragOver={(e) => { e.preventDefault(); setOver(which); }} onDragLeave={() => setOver(null)}
        onDrop={(e) => { e.preventDefault(); setOver(null); take(which, e.dataTransfer.files[0]); }}>
        {value ? <img src={value} alt={label} /> : <span className="small" style={{ color: which === "dark" ? "#fff" : colors.dark }}>Drop a PNG or SVG here, or click to choose</span>}
      </label>
      <input id={`logo-${which}`} type="file" hidden accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={(e) => take(which, e.target.files?.[0])} />
      {value && <button className="btn btn-ghost" type="button" style={{ alignSelf: "flex-start" }} onClick={() => onChange(which === "light" ? { light: null, dark } : { light, dark: null })}>Remove</button>}
    </div>
  );
  return (
    <div className="stack">
      <div className="logo-pair">
        {box("light", "Logo for light backgrounds", colors.light, light)}
        {box("dark", "Logo for dark backgrounds and photos", colors.dark, dark)}
      </div>
      <p className="small muted">Upload one logo and SocialPilot makes the white version for dark posts automatically, if your logo has a transparent background.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function ColourPicker({ colors, onChange }: { colors: BrandProfile["colors"]; onChange: (c: BrandProfile["colors"]) => void }) {
  const one = (label: string, value: string, set: (v: string) => void, remove?: () => void) => (
    <div className="swatch" key={label}>
      <input type="color" aria-label={label} value={HEX.test(value) ? value : "#000000"} onChange={(e) => set(e.target.value.toUpperCase())} />
      <span>{label}</span>
      <input type="text" aria-label={`${label} hex`} value={value} onChange={(e) => set(e.target.value)} style={{ width: 96, padding: "6px 8px" }} />
      {remove && <button className="btn btn-ghost" type="button" style={{ minHeight: 30, padding: "2px 8px" }} onClick={remove}>Remove</button>}
    </div>
  );
  return (
    <div className="swatches">
      {one("Accent", colors.primary, (v) => onChange({ ...colors, primary: v }))}
      {one("Dark", colors.dark, (v) => onChange({ ...colors, dark: v }))}
      {one("Light", colors.light, (v) => onChange({ ...colors, light: v }))}
      {colors.supporting.map((c, i) => one(`Extra ${i + 1}`, c, (v) => onChange({ ...colors, supporting: colors.supporting.map((x, j) => (j === i ? v : x)) }), () => onChange({ ...colors, supporting: colors.supporting.filter((_, j) => j !== i) })))}
      {colors.supporting.length < 4 && <button className="btn" type="button" style={{ alignSelf: "flex-start" }} onClick={() => onChange({ ...colors, supporting: [...colors.supporting, "#888888"] })}>Add colour</button>}
    </div>
  );
}

export function BrandKit({ brand }: { brand: Brand }) {
  const router = useRouter();
  const p = brand.profile;
  const [colors, setColors] = useState(p.colors);
  const [logos, setLogos] = useState({ light: brand.logo_on_light, dark: brand.logo_on_dark });
  const [fonts, setFonts] = useState(p.fonts);
  const [time, setTime] = useState(brand.settings.time);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    for (const c of [colors.primary, colors.dark, colors.light, ...colors.supporting]) if (!HEX.test(c)) return setError(`"${c}" is not a colour. Use the form #1A2B3C.`);
    const profile: BrandProfile = {
      name: g("name") || brand.name, oneLiner: g("oneLiner"), website: g("website"),
      offerings: textToPairs(g("offerings")), audience: lines(g("audience")), pillars: textToPairs(g("pillars")),
      voice: { traits: lines(g("traits")), do: lines(g("do")), dont: lines(g("dont")) },
      facts: lines(g("facts")), ctas: lines(g("ctas")), hashtags: lines(g("hashtags")),
      colors, fonts, imageStyle: g("imageStyle"),
    };
    setState("saving"); setError("");
    const res = await fetch(`/api/brands/${brand.id}`, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, settings: { ...brand.settings, time }, logo_on_light: logos.light, logo_on_dark: logos.dark }) });
    if (!res.ok) { setState("idle"); return setError((await res.json().catch(() => ({}))).error ?? "Could not save."); }
    setState("saved"); router.refresh(); setTimeout(() => setState("idle"), 2000);
  }
  async function remove() {
    if (confirmDelete !== brand.name) return setError(`Type ${brand.name} to confirm.`);
    await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    router.push("/");
  }
  const area = (name: string, label: string, value: string, hint?: string, rows = 4) => (
    <label className="field" htmlFor={name}>{label}{hint && <span className="hint">{hint}</span>}<textarea id={name} name={name} defaultValue={value} rows={rows} /></label>
  );
  const preview: BrandProfile = { ...p, colors, fonts };

  return (
    <form className="wrap" onSubmit={save}>
      <div className="head">
        <div><h1 className="title">Brand kit</h1><p className="sub">Every post follows this. Changes apply to new posts and to the previews of existing ones.</p></div>
        <button className="btn btn-ink" type="submit" disabled={state === "saving"}>{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save changes"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card stack">
        <h2>Logo</h2>
        <LogoUpload colors={colors} light={logos.light} dark={logos.dark} onChange={setLogos} />
      </section>

      <section className="card kit-look">
        <div className="stack">
          <h2>Colours and fonts</h2>
          <ColourPicker colors={colors} onChange={setColors} />
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>Headline font<span className="hint">Any Google Fonts name</span><input type="text" value={fonts.display} onChange={(e) => setFonts({ ...fonts, display: e.target.value })} /></label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>Body font<span className="hint">Any Google Fonts name</span><input type="text" value={fonts.body} onChange={(e) => setFonts({ ...fonts, body: e.target.value })} /></label>
          </div>
        </div>
        <ScaledPost brand={preview} spec={SAMPLE} logoOnLight={logos.light} logoOnDark={logos.dark} animate={false} />
      </section>

      <section className="card stack">
        <h2>About the business</h2>
        <label className="field">Name<input type="text" name="name" defaultValue={p.name} required /></label>
        <label className="field">One-liner<span className="hint">What the business is and why customers care.</span><input type="text" name="oneLiner" defaultValue={p.oneLiner} /></label>
        <label className="field">Website<input type="text" name="website" defaultValue={p.website} /></label>
        {area("offerings", "Products and services", pairsToText(p.offerings), "One per line, as Name: description")}
        {area("facts", "Facts posts may use", p.facts.join("\n"), "Numbers and claims that are true today. Posts never use numbers that aren't here.", 5)}
      </section>

      <section className="card stack">
        <h2>Audience and voice</h2>
        {area("audience", "Audience", p.audience.join("\n"), "One group per line, most important first.")}
        {area("pillars", "Content pillars", pairsToText(p.pillars), "3-6 themes, one per line, as Name: description", 5)}
        {area("traits", "Voice", p.voice.traits.join("\n"), "One trait per line.", 3)}
        {area("do", "Always", p.voice.do.join("\n"))}
        {area("dont", "Never", p.voice.dont.join("\n"))}
        {area("ctas", "Calls to action", p.ctas.join("\n"), "One per line.", 3)}
        {area("hashtags", "Hashtags", p.hashtags.join("\n"), "One per line.", 3)}
        {area("imageStyle", "Photo style", p.imageStyle, "How AI photos should look: places, people, light, mood.", 3)}
      </section>

      <section className="card stack">
        <h2>Posting</h2>
        <label className="field" style={{ maxWidth: 200 }}>Posting time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <p className="small muted">Choose posting days on the calendar.</p>
      </section>

      <section className="card stack">
        <h2>Delete brand</h2>
        <p className="small muted">Deletes the brand with all its posts, photos and videos. This cannot be undone.</p>
        <div className="row">
          <input type="text" aria-label={`Type ${brand.name} to confirm`} placeholder={`Type ${brand.name} to confirm`} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} style={{ maxWidth: 260 }} />
          <button className="btn btn-danger" type="button" onClick={remove}>Delete brand</button>
        </div>
      </section>
    </form>
  );
}
