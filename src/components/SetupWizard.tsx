"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColourPicker, LogoUpload } from "./BrandKit";
import type { Brand } from "@/lib/types";

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [colors, setColors] = useState<Brand["profile"]["colors"] | null>(null);
  const [logos, setLogos] = useState<{ light: string | null; dark: string | null }>({ light: null, dark: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readNote, setReadNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function read(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/brands", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: f.get("name"), website: f.get("website"), source: f.get("source") }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not set up the brand.");
      const b: Brand = await (await fetch(`/api/brands/${data.id}`)).json();
      setBrand(b); setColors(b.profile.colors); setLogos({ light: b.logo_on_light, dark: b.logo_on_dark });
      if (data.site) setReadNote({ ok: true, text: `Read ${data.site.pages} page${data.site.pages === 1 ? "" : "s"} of ${new URL(data.site.url).hostname}${data.site.logo ? ", with your logo" : ""}${data.site.fonts?.length ? ` and fonts (${data.site.fonts.slice(0, 2).join(", ")})` : ""}.` });
      else if (data.siteNote) setReadNote({ ok: false, text: `${data.siteNote} We used what you wrote instead.` });
      setStep(2);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  async function finish() {
    if (!brand || !colors) return;
    setBusy(true);
    const res = await fetch(`/api/brands/${brand.id}`, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: { ...brand.profile, colors }, logo_on_light: logos.light, logo_on_dark: logos.dark }) });
    setBusy(false);
    if (!res.ok) return setError("Could not save. Try again.");
    router.push(`/b/${brand.id}`);
  }

  const bar = <div className="wiz-steps" aria-label={`Step ${step} of 3`}>{[1, 2, 3].map((i) => <span key={i} className={i <= step ? "on" : ""} />)}</div>;
  const p = brand?.profile;

  if (step === 1) return (
    <form className="card stack" style={{ gap: 18, padding: 26 }} onSubmit={read}>
      {bar}
      <div><div className="small muted">Step 1 of 3</div><h1 className="title" style={{ marginTop: 8 }}>Tell us about the business</h1>
        <p className="sub">Add your website and Buzzbite reads it for your voice, what you sell, your colours, fonts and logo. No website? Paste a description instead.</p></div>
      <label className="field">Business name<input type="text" name="name" required maxLength={80} placeholder="e.g. Beamer" /></label>
      <label className="field">Website<span className="hint">We read your home page and a few key pages, like About and Services.</span><input type="text" name="website" inputMode="url" placeholder="yourbusiness.com" /></label>
      <label className="field">Anything else? <span className="hint">Optional. A pitch deck, concept note or what makes you different. The more detail, the better the posts.</span><textarea name="source" rows={6} maxLength={60000} placeholder="Paste anything that describes the business…" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row"><button className="btn btn-ink btn-lg" type="submit" disabled={busy}>{busy ? "Reading your business… (about a minute)" : "Continue"}</button></div>
    </form>
  );

  if (step === 2 && p) return (
    <section className="card stack" style={{ gap: 18, padding: 26 }}>
      {bar}
      <div><div className="small muted">Step 2 of 3</div><h1 className="title" style={{ marginTop: 8 }}>Here&rsquo;s what we learned</h1>
        <p className="sub">You can change any of this later in the Brand kit. Posts only ever use facts listed here.</p></div>
      {readNote && <p className={readNote.ok ? "notice" : "error"} role="status">{readNote.text}</p>}
      {p.oneLiner && <p style={{ fontSize: 17 }}>{p.oneLiner}</p>}
      <div className="ideas" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
        {([["Voice", p.voice.traits], ["Audience", p.audience], ["Content themes", p.pillars.map((x) => x.name)], ["Facts posts can use", p.facts]] as const).map(([h, items]) => (
          <div key={h} className="idea"><h3 style={{ fontSize: 16 }}>{h}</h3>{items.length ? <div className="tags">{items.slice(0, 8).map((t) => <span key={t}>{t}</span>)}</div> : <p>Nothing found. Add it in the Brand kit.</p>}</div>
        ))}
      </div>
      <div className="row"><button className="btn btn-ink btn-lg" type="button" onClick={() => setStep(3)}>Looks right</button></div>
    </section>
  );

  return (
    <section className="card stack" style={{ gap: 18, padding: 26 }}>
      {bar}
      <div><div className="small muted">Step 3 of 3</div><h1 className="title" style={{ marginTop: 8 }}>Your look</h1>
        <p className="sub">{logos.light ? "We found these on your website. Check them, or swap in your own." : "Add your logo and check the colours."} Every post uses them.</p></div>
      {colors && <LogoUpload colors={colors} light={logos.light} dark={logos.dark} onChange={setLogos} />}
      {colors && <ColourPicker colors={colors} onChange={setColors} />}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row"><button className="btn btn-ink btn-lg" type="button" onClick={finish} disabled={busy}>{busy ? "Saving…" : "Save and open the calendar"}</button></div>
    </section>
  );
}
