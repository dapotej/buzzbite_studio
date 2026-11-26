"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Brand, BrandProfile } from "@/lib/types";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const pairsToText = (p: { name: string; description: string }[]) => p.map((x) => (x.description ? `${x.name}: ${x.description}` : x.name)).join("\n");
const textToPairs = (s: string) =>
  lines(s).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? { name: l.slice(0, i).trim(), description: l.slice(i + 1).trim() } : { name: l, description: "" };
  });
const HEX = /^#[0-9a-fA-F]{6}$/;

async function fileToLogoDataUrl(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    if (file.size > 300_000) throw new Error("That SVG is over 300 KB. Use a smaller file.");
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Could not read the file."));
      r.readAsDataURL(file);
    });
  }
  const bmp = await createImageBitmap(file);
  const h = Math.min(240, bmp.height);
  const w = Math.round((bmp.width / bmp.height) * h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return c.toDataURL("image/png");
}

export function BrandForm({ brand }: { brand: Brand }) {
  const router = useRouter();
  const p = brand.profile;
  const [colors, setColors] = useState(p.colors);
  const [logos, setLogos] = useState({ light: brand.logo_on_light, dark: brand.logo_on_dark });
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  async function pickLogo(which: "light" | "dark", file: File | undefined) {
    if (!file) return;
    try {
      const url = await fileToLogoDataUrl(file);
      setLogos((l) => ({ ...l, [which]: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that image.");
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    for (const k of ["primary", "dark", "light"] as const) {
      if (!HEX.test(colors[k])) return setError(`The ${k} colour must look like #1A2B3C.`);
    }
    if (colors.supporting.some((c) => !HEX.test(c))) return setError("Each secondary colour must look like #1A2B3C.");
    const profile: BrandProfile = {
      name: g("name") || brand.name,
      oneLiner: g("oneLiner"),
      website: g("website"),
      offerings: textToPairs(g("offerings")),
      audience: lines(g("audience")),
      pillars: textToPairs(g("pillars")),
      voice: { traits: lines(g("traits")), do: lines(g("do")), dont: lines(g("dont")) },
      facts: lines(g("facts")),
      ctas: lines(g("ctas")),
      hashtags: lines(g("hashtags")),
      colors,
      fonts: { display: g("fontDisplay") || "Poppins", body: g("fontBody") || "Inter" },
      imageStyle: g("imageStyle"),
    };
    setState("saving");
    setError("");
    const res = await fetch(`/api/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, logo_on_light: logos.light, logo_on_dark: logos.dark }),
    });
    if (!res.ok) {
      setState("idle");
      setError((await res.json().catch(() => ({}))).error ?? "Could not save.");
      return;
    }
    setState("saved");
    router.refresh();
    setTimeout(() => setState("idle"), 2000);
  }

  async function remove() {
    const typed = (document.getElementById("confirm-delete") as HTMLInputElement | null)?.value;
    if (typed !== brand.name) return setError(`Type ${brand.name} in the box to delete this brand.`);
    await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    router.push("/");
  }

  // A plain function, not a component, so textareas keep what was typed when the form re-renders.
  const T = ({ name, label, hint, value, rows = 4 }: { name: string; label: string; hint?: string; value: string; rows?: number }) => (
    <label className="field" htmlFor={name}>
      {label}
      {hint && <span className="hint">{hint}</span>}
      <textarea id={name} name={name} defaultValue={value} rows={rows} key={name} />
    </label>
  );

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={save}>
      <section className="card stack">
        <h2>Basics</h2>
        <label className="field" htmlFor="name">Name<input id="name" name="name" type="text" defaultValue={p.name} required /></label>
        <label className="field" htmlFor="oneLiner">One-liner<span className="hint">What the business is and why customers care, in one sentence.</span>
          <input id="oneLiner" name="oneLiner" type="text" defaultValue={p.oneLiner} /></label>
        <label className="field" htmlFor="website">Website<input id="website" name="website" type="text" defaultValue={p.website} placeholder="example.com" /></label>
        {T({ name: "offerings", label: "Products and services", hint: "One per line, as Name: description", value: pairsToText(p.offerings) })}
      </section>

      <section className="card stack">
        <h2>Look</h2>
        <div className="swatches">
          {(["primary", "dark", "light"] as const).map((k) => (
            <label key={k} className="swatch" htmlFor={`c-${k}`}>
              <input id={`c-${k}`} type="color" value={HEX.test(colors[k]) ? colors[k] : "#000000"} onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value.toUpperCase() }))} />
              <span>{k === "primary" ? "Accent" : k === "dark" ? "Dark background" : "Light background"}</span>
              <input aria-label={`${k} colour hex`} type="text" value={colors[k]} onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))} style={{ width: 100 }} />
            </label>
          ))}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Secondary colours <span className="muted" style={{ fontWeight: 400 }}>Up to 4. Used for numbers, bars, map pins and motion accents.</span></span>
          <div className="swatches">
            {colors.supporting.map((c, i) => (
              <span key={i} className="swatch">
                <input type="color" aria-label={`Secondary colour ${i + 1}`} value={HEX.test(c) ? c : "#000000"}
                  onChange={(e) => setColors((x) => ({ ...x, supporting: x.supporting.map((v, j) => (j === i ? e.target.value.toUpperCase() : v)) }))} />
                <input type="text" aria-label={`Secondary colour ${i + 1} hex`} value={c} style={{ width: 100 }}
                  onChange={(e) => setColors((x) => ({ ...x, supporting: x.supporting.map((v, j) => (j === i ? e.target.value : v)) }))} />
                <button type="button" className="btn btn-ghost" aria-label={`Remove secondary colour ${i + 1}`}
                  onClick={() => setColors((x) => ({ ...x, supporting: x.supporting.filter((_, j) => j !== i) }))}>Remove</button>
              </span>
            ))}
            {colors.supporting.length < 4 && (
              <button type="button" className="btn" onClick={() => setColors((x) => ({ ...x, supporting: [...x.supporting, "#888888"] }))}>Add colour</button>
            )}
          </div>
        </div>
        <div className="row" style={{ alignItems: "stretch" }}>
          <label className="field" htmlFor="fontDisplay" style={{ flex: 1, minWidth: 200 }}>Headline font<span className="hint">Any Google Fonts family name.</span>
            <input id="fontDisplay" name="fontDisplay" type="text" defaultValue={p.fonts.display} /></label>
          <label className="field" htmlFor="fontBody" style={{ flex: 1, minWidth: 200 }}>Body font<span className="hint">Any Google Fonts family name.</span>
            <input id="fontBody" name="fontBody" type="text" defaultValue={p.fonts.body} /></label>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
          {(["light", "dark"] as const).map((w) => (
            <div key={w} className="stack" style={{ gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Logo for {w} backgrounds</span>
              <div className="logo-box" style={{ background: w === "light" ? colors.light : colors.dark }}>
                {logos[w] ? <img src={logos[w]!} alt={`${p.name} logo on ${w}`} /> : <span className="small" style={{ color: w === "light" ? colors.dark : "#fff" }}>No logo: the name is used</span>}
              </div>
              <div className="row">
                <label className="btn" htmlFor={`logo-${w}`}>Upload PNG or SVG</label>
                <input id={`logo-${w}`} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden onChange={(e) => pickLogo(w, e.target.files?.[0])} />
                {logos[w] && <button className="btn btn-ghost" type="button" onClick={() => setLogos((l) => ({ ...l, [w]: null }))}>Remove</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Audience and content</h2>
        {T({ name: "imageStyle", label: "Photo and image style", hint: "Art direction for AI images: subjects, setting, light, mood.", value: p.imageStyle ?? "", rows: 3 })}
        {T({ name: "audience", label: "Audience", hint: "One group per line, most important first.", value: p.audience.join("\n") })}
        {T({ name: "pillars", label: "Content pillars", hint: "3-6 recurring themes, one per line, as Name: description", value: pairsToText(p.pillars), rows: 6 })}
        {T({ name: "facts", label: "Facts posts may use", hint: "Numbers, claims and proof points that are true today. Posts never use numbers that are not here.", value: p.facts.join("\n"), rows: 6 })}
        {T({ name: "ctas", label: "Calls to action", hint: "One per line.", value: p.ctas.join("\n"), rows: 3 })}
        {T({ name: "hashtags", label: "Hashtags", hint: "One per line, for Instagram.", value: p.hashtags.join("\n"), rows: 3 })}
      </section>

      <section className="card stack">
        <h2>Voice</h2>
        {T({ name: "traits", label: "Voice traits", hint: "One per line, e.g. plain, confident, specific.", value: p.voice.traits.join("\n"), rows: 3 })}
        {T({ name: "do", label: "Always", hint: "One rule per line.", value: p.voice.do.join("\n") })}
        {T({ name: "dont", label: "Never", hint: "One rule per line.", value: p.voice.dont.join("\n") })}
      </section>

      <div className="row" style={{ position: "sticky", bottom: 0, background: "var(--bg)", padding: "12px 0", borderTop: "1px solid var(--line)" }}>
        <button className="btn btn-primary" type="submit" disabled={state === "saving"}>{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save brand profile"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <section className="card stack">
        <h2>Delete brand</h2>
        <p className="muted small">This deletes the brand with all its ideas and posts. It cannot be undone.</p>
        <div className="row">
          <input id="confirm-delete" type="text" aria-label={`Type ${brand.name} to confirm`} placeholder={`Type ${brand.name} to confirm`} style={{ maxWidth: 280 }} />
          <button className="btn btn-danger" type="button" onClick={remove}>Delete brand</button>
        </div>
      </section>
    </form>
  );
}
