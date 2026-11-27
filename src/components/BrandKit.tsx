"use client";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logoToDataUrl, whiteVersion } from "./logo";
import { ScaledPost } from "./PostThumb";
import { LOOK_OPTIONS, PLATFORM_NAMES, PLATFORMS, TEMPLATES, TEMPLATE_IDS, type Brand, type BrandProfile, type Look, type TemplateId, type Platform, type PostSpec, type ProductReference, type SocialAccount, VOICES } from "@/lib/types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const pairsToText = (p: { name: string; description: string }[]) => p.map((x) => (x.description ? `${x.name}: ${x.description}` : x.name)).join("\n");
const textToPairs = (s: string) => lines(s).map((l) => { const i = l.indexOf(":"); return i > 0 ? { name: l.slice(0, i).trim(), description: l.slice(i + 1).trim() } : { name: l, description: "" }; });

const SAMPLE: PostSpec = {
  template: "statement", theme: "dark", kicker: "Preview", headline: "Your brand, *on autopilot.*", quote: "", sub: "", note: "", big: "", bigLabel: "",
  items: [], bubbles: [], lines: [], endline: "", cta: "", imagePrompt: "", motionPrompt: "", showsProduct: false, slides: [], scenes: [], music: "", media: null, clip: null,
};

const LOOK_LABELS: Record<keyof typeof LOOK_OPTIONS, string> = {
  type: "Headline type", emphasis: "Key words", corners: "Corners", align: "Alignment", photo: "Photos", surface: "Background",
  texture: "Background texture", labels: "Labels", logo: "Logo", spacing: "Scale",
};

/** Ready-made styles. Each keeps the brand's colours, fonts, favourite designs and headline habits. */
const STYLES: { name: string; look: Partial<Look> }[] = [
  { name: "Classic bold", look: { type: "heavy", emphasis: "classic", corners: "soft", align: "left", photo: "natural", surface: "mixed", texture: "grid", labels: "solid", logo: "bottom", spacing: "bold" } },
  { name: "Creator pop", look: { type: "heavy", emphasis: "highlight", corners: "round", align: "center", photo: "warm", surface: "mixed", texture: "dots", labels: "solid", logo: "bottom", spacing: "bold" } },
  { name: "Editorial calm", look: { type: "editorial", emphasis: "italic", corners: "sharp", align: "left", photo: "natural", surface: "light", texture: "none", labels: "plain", logo: "top", spacing: "airy" } },
  { name: "Night signal", look: { type: "caps", emphasis: "color", corners: "sharp", align: "left", photo: "vivid", surface: "dark", texture: "lines", labels: "outline", logo: "top", spacing: "bold" } },
  { name: "Soft and warm", look: { type: "light", emphasis: "underline", corners: "round", align: "center", photo: "warm", surface: "mixed", texture: "grain", labels: "outline", logo: "bottom", spacing: "airy" } },
  { name: "Bold blocks", look: { type: "caps", emphasis: "highlight", corners: "sharp", align: "left", photo: "duotone", surface: "colour", texture: "none", labels: "solid", logo: "bottom", spacing: "bold" } },
];
const SAMPLE_STYLE: PostSpec = { ...SAMPLE, template: "statement", theme: "light", kicker: "Tip", headline: "Post less. Say *more*.", sub: "One good idea a day beats five rushed ones." };
const SAMPLE_NOTE: PostSpec = { ...SAMPLE, template: "note", theme: "accent", headline: "This week", items: [{ title: "Approve posts", detail: "" }, { title: "Reply to comments", detail: "" }, { title: "That's it", detail: "" }] };

/** Pick a style by looking at it. Fine details are folded away. */
function StylePicker({ brand, profile, look, logos, onChange }: {
  brand: Brand; profile: BrandProfile; look: Look; logos: { light: string | null; dark: string | null }; onChange: (l: Look) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const same = (l: Partial<Look>) => (Object.keys(l) as (keyof Look)[]).every((k) => look[k] === l[k]);
  async function suggest() {
    setBusy(true); setError("");
    const res = await fetch(`/api/brands/${brand.id}/look`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ different: true }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not suggest a style.");
    onChange(body.look);
  }
  const mine = !STYLES.some((st) => same(st.look));
  const options = [...(mine ? [{ name: "Your current style", look }] : []), ...STYLES];
  return (
    <div className="stack">
      <div className="style-grid" role="radiogroup" aria-label="Style">
        {options.map((st) => {
          const on = same(st.look);
          const preview = { ...profile, look: { ...look, ...st.look } };
          return (
            <button type="button" key={st.name} role="radio" aria-checked={on} className={`style-card${on ? " on" : ""}`}
              onClick={() => onChange({ ...look, ...st.look, name: st.name })}>
              <ScaledPost brand={preview} spec={SAMPLE_STYLE} logoOnLight={logos.light} logoOnDark={logos.dark} animate={false} />
              <span>{on ? "✓ " : ""}{st.name}</span>
            </button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" onClick={suggest} disabled={busy}>{busy ? "Thinking…" : `Suggest a new style for ${brand.name}`}</button>
        {error && <span className="error" role="alert">{error}</span>}
      </div>
      <details className="fine-tune">
        <summary>Fine-tune the style</summary>
        <FineTune look={look} onChange={onChange} />
      </details>
    </div>
  );
}

/** Every look setting, for people who want control. */
function FineTune({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  const toggle = (t: TemplateId) => onChange({ ...look, templates: look.templates.includes(t) ? look.templates.filter((x) => x !== t) : [...look.templates, t] });
  return (
    <div className="stack" style={{ paddingTop: 12 }}>
      <div className="look-grid">
        {(Object.keys(LOOK_OPTIONS) as (keyof typeof LOOK_OPTIONS)[]).map((k) => (
          <label className="field" key={k}>{LOOK_LABELS[k]}
            <select value={look[k]} onChange={(e) => onChange({ ...look, [k]: e.target.value })}>
              {Object.entries(LOOK_OPTIONS[k]).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Favourite designs<span className="hint"> Used for about half the posts; the others fill the rest.</span></legend>
        <div className="chips">
          {TEMPLATE_IDS.map((t) => (
            <button type="button" key={t} className={`chip-toggle${look.templates.includes(t) ? " on" : ""}`} aria-pressed={look.templates.includes(t)} onClick={() => toggle(t)}>{TEMPLATES[t].name}</button>
          ))}
        </div>
      </fieldset>
      <label className="field">Headline style<span className="hint">How this brand writes headlines: tone, structure, questions, numbers, wordplay.</span>
        <textarea rows={2} value={look.headlines} onChange={(e) => onChange({ ...look, headlines: e.target.value })} />
      </label>
    </div>
  );
}

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
      <p className="small muted">Upload one logo and Buzzbite makes the white version for dark posts automatically, if your logo has a transparent background.</p>
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

type Tab = "look" | "words" | "photos" | "posting" | "more";
const TABS: [Tab, string][] = [["look", "Look"], ["words", "Business and voice"], ["photos", "Photos"], ["posting", "Accounts and posting"], ["more", "More"]];

export function BrandKit({ brand }: { brand: Brand }) {
  const router = useRouter();
  const p = brand.profile;
  const [colors, setColors] = useState(p.colors);
  const [logos, setLogos] = useState({ light: brand.logo_on_light, dark: brand.logo_on_dark });
  const [fonts, setFonts] = useState(p.fonts);
  const [look, setLook] = useState<Look>(p.look);
  const [time, setTime] = useState(brand.settings.time);
  const [tz, setTz] = useState(brand.settings.tz);
  const [refs, setRefs] = useState<ProductReference[]>(brand.settings.references);
  const [voice, setVoice] = useState(brand.settings.voice);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [tab, setTab] = useState<Tab>("look");

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
      colors, fonts, imageStyle: g("imageStyle"), look,
    };
    setState("saving"); setError("");
    const res = await fetch(`/api/brands/${brand.id}`, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, settings: { ...brand.settings, time, tz, references: refs, voice }, logo_on_light: logos.light, logo_on_dark: logos.dark }) });
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
  const preview: BrandProfile = { ...p, colors, fonts, look };

  return (
    <form className="wrap" onSubmit={save}>
      <div className="head">
        <div><h1 className="title">Brand kit</h1><p className="sub">Every post follows this. Changes apply to new posts and to the previews of existing ones.</p></div>
        <button className="btn btn-ink" type="submit" disabled={state === "saving"}>{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save changes"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <nav className="seg kit-tabs" aria-label="Brand kit sections">
        {TABS.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      {/* Hidden tabs stay in the form, so Save always keeps every field. */}
      <div className="stack" hidden={tab !== "look"}>
        <section className="card stack">
          <div><h2>Style</h2><p className="small muted">Pick the one that feels most like {brand.name}. Every post follows it; each post still varies its design and colours.</p></div>
          <StylePicker brand={brand} profile={preview} look={look} logos={logos} onChange={setLook} />
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
          <ScaledPost brand={preview} spec={SAMPLE_NOTE} logoOnLight={logos.light} logoOnDark={logos.dark} animate={false} />
        </section>
        <section className="card stack">
          <h2>Logo</h2>
          <LogoUpload colors={colors} light={logos.light} dark={logos.dark} onChange={setLogos} />
        </section>
      </div>

      <div className="stack" hidden={tab !== "words"}>
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
      </section>
      </div>

      <div className="stack" hidden={tab !== "photos"}>
        <section className="card stack">
          <h2>Photo style</h2>
          {area("imageStyle", "How AI photos should look", p.imageStyle, "Places, people, light and mood.", 5)}
        </section>
        <ProductPhotos brandId={brand.id} refs={refs} onChange={setRefs} />
      </div>

      <div className="stack" hidden={tab !== "posting"}>
      <SocialAccounts brand={brand} />

      <section className="card stack">
        <h2>Posting</h2>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ maxWidth: 200 }}>Posting time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label className="field" style={{ minWidth: 220 }}>Time zone
            <select value={tz} onChange={(e) => setTz(e.target.value)}>
              {[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </label>
        </div>
        <label className="field" style={{ maxWidth: 360 }}>Reel narrator<span className="hint">The voice that reads your reels&rsquo; voice-overs.</span>
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            {[...new Set([voice, ...VOICES.map((v) => v.id)])].map((id) => <option key={id} value={id}>{VOICES.find((v) => v.id === id)?.label ?? id}</option>)}
          </select>
        </label>
        <p className="small muted">Choose posting days on the calendar.</p>
      </section>
      </div>

      <div className="stack" hidden={tab !== "more"}>
      <RefreshFromSite brand={brand} />
      <UpdatePosts brand={brand} />

      <section className="card stack">
        <h2>Delete brand</h2>
        <p className="small muted">Deletes the brand with all its posts, photos and videos. This cannot be undone.</p>
        <div className="row">
          <input type="text" aria-label={`Type ${brand.name} to confirm`} placeholder={`Type ${brand.name} to confirm`} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} style={{ maxWidth: 260 }} />
          <button className="btn btn-danger" type="button" onClick={remove}>Delete brand</button>
        </div>
      </section>
      </div>
    </form>
  );
}

const ZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "UTC"];

/** Instagram and LinkedIn accounts posts go out to, connected through the posting service. */
function SocialAccounts({ brand }: { brand: Brand }) {
  const [accounts, setAccounts] = useState<SocialAccount[]>(brand.social.accounts);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const back = new URLSearchParams(window.location.search);
    if (back.get("error")) setError(back.get("error_message") || `${back.get("platform") ?? "The account"} could not be connected (${back.get("error")}).`);
    fetch(`/api/brands/${brand.id}/social`).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Could not load connected accounts.");
      setConfigured(data.configured); setAccounts(data.accounts);
      const done = back.get("connected") as Platform | null;
      if (done && data.accounts.some((a: SocialAccount) => a.platform === done)) setNote(`${PLATFORM_NAMES[done]} is connected. Approved posts now go out automatically.`);
    }).catch(() => setError("Could not load connected accounts."));
  }, [brand.id]);

  async function connect(platform: Platform) {
    setBusy(platform); setError("");
    const res = await fetch(`/api/brands/${brand.id}/social/connect`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(null); return setError(data.error ?? "Could not start connecting."); }
    window.location.href = data.url;
  }
  async function disconnect(a: SocialAccount) {
    if (!window.confirm(`Disconnect ${a.name}? Scheduled posts to it will not go out.`)) return;
    setBusy(a.id); setError("");
    const res = await fetch(`/api/brands/${brand.id}/social?account=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Could not disconnect.");
    setAccounts(data.accounts);
  }

  return (
    <section className="card stack" id="accounts">
      <h2>Social accounts</h2>
      {!configured ? (
        <p className="small muted">Auto-posting is not switched on yet. Add your Zernio API key as ZERNIO_API_KEY in Vercel, then redeploy.</p>
      ) : (
        <>
          <p className="small muted">Approved posts go out to these accounts on their date, at the posting time below. Instagram needs a Business or Creator account.</p>
          {accounts.length > 0 && (
            <div className="accounts">
              {accounts.map((a) => (
                <div className="account" key={a.id}>
                  {a.picture ? <img src={a.picture} alt="" /> : <span className="av" aria-hidden="true">{a.name.slice(0, 1)}</span>}
                  <div className="who"><strong>{a.name}</strong><span className="small muted">{PLATFORM_NAMES[a.platform]}{a.username ? ` · @${a.username}` : ""}</span></div>
                  <span className="spacer" />
                  <button className="btn btn-ghost" type="button" onClick={() => disconnect(a)} disabled={busy !== null}>{busy === a.id ? "Disconnecting…" : "Disconnect"}</button>
                </div>
              ))}
            </div>
          )}
          <div className="row">
            {PLATFORMS.map((p) => (
              <button key={p} className="btn" type="button" onClick={() => connect(p)} disabled={busy !== null}>
                {busy === p ? "Opening…" : accounts.some((a) => a.platform === p) ? `Reconnect ${PLATFORM_NAMES[p]}` : `Connect ${PLATFORM_NAMES[p]}`}
              </button>
            ))}
          </div>
        </>
      )}
      {note && <p className="notice" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

const REWRITE = "Rewrite this post so it follows the current brand profile exactly: its voice, offerings, facts, content themes and the do and don't lists. "
  + "Remove or replace any claim that the facts do not support. Keep the publish date, and keep the topic if it still fits the brand; otherwise choose a better topic for the date. "
  + "If the image shows the brand's product, write a new imagePrompt that follows the art direction word for word and set newPhoto true; otherwise keep the photo.";

/** Rewrites every upcoming post against the current brand kit, one at a time. */
function UpdatePosts({ brand }: { brand: Brand }) {
  const router = useRouter();
  const [state, setState] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [running, setRunning] = useState(false);
  async function run() {
    const list = await fetch(`/api/brands/${brand.id}/upcoming`).then((r) => r.json()).catch(() => ({ posts: [] }));
    const posts: { id: string; title: string; publish_on: string | null; status: string }[] = list.posts ?? [];
    if (!posts.length) return setState({ done: 0, total: 0, failed: [] });
    const approved = posts.filter((p) => p.status === "approved").length;
    if (!window.confirm(`Rewrite ${posts.length} upcoming post${posts.length === 1 ? "" : "s"} to match this brand kit?${approved ? `\n\n${approved} approved post${approved === 1 ? "" : "s"} will go back to review (and any scheduled ones are cancelled) so you can check them.` : ""}\n\nSome posts get new photos. Keep this page open; it takes about half a minute a post.`)) return;
    setRunning(true);
    const failed: string[] = [];
    for (let i = 0; i < posts.length; i++) {
      setState({ done: i, total: posts.length, failed });
      const res = await fetch(`/api/posts/${posts[i].id}/revise`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction: REWRITE }) }).catch(() => null);
      if (!res?.ok) failed.push(posts[i].title || posts[i].publish_on || "A post");
    }
    setState({ done: posts.length, total: posts.length, failed });
    setRunning(false);
    router.refresh();
  }
  return (
    <section className="card stack">
      <h2>Update upcoming posts</h2>
      <p className="small muted">Changed the brand kit? Rewrite every post that hasn&rsquo;t gone out yet so it matches. Save your changes first. Rewritten posts come back for review.</p>
      <div className="row">
        <button className="btn" type="button" onClick={run} disabled={running}>
          {running && state ? `Rewriting ${state.done + 1} of ${state.total}…` : "Update upcoming posts"}
        </button>
      </div>
      {state && !running && (
        <p className="notice" role="status">
          {state.total === 0 ? "No upcoming posts to update." : `Rewrote ${state.total - state.failed.length} of ${state.total} posts. New photos appear in a minute or two.`}
          {state.failed.length > 0 && ` Could not rewrite: ${state.failed.join(", ")}. Try again.`}
        </p>
      )}
    </section>
  );
}

/** Real photos of the brand's product. Photos that show the product are drawn from these. */
function ProductPhotos({ brandId, refs, onChange }: { brandId: string; refs: ProductReference[]; onChange: (r: ProductReference[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError("");
    try {
      const added: ProductReference[] = [];
      for (const file of Array.from(files).slice(0, 4 - refs.length)) {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError(`${file.name} is not a PNG, JPEG or WebP photo.`); continue; }
        const blob = await upload(`brands/${brandId}/reference/${file.name.replace(/[^\w.-]+/g, "-")}`, file, { access: "public", handleUploadUrl: "/api/media/upload" });
        added.push({ url: blob.url, note: "" });
      }
      onChange([...refs, ...added]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload the photo."); }
    finally { setBusy(false); }
  }
  return (
    <section className="card stack" id="product-photos">
      <h2>Product photos</h2>
      <p className="small muted">Upload up to 4 real photos of your product. Whenever a post shows the product, Buzzbite draws it from these so it looks right. Say what matters in each photo. Save changes when you&rsquo;re done.</p>
      {refs.length > 0 && (
        <div className="refs">
          {refs.map((r, i) => (
            <div className="ref" key={r.url}>
              <img src={r.url} alt={`Product photo ${i + 1}`} />
              <label className="field">What to copy from this photo
                <textarea rows={3} value={r.note} maxLength={600} placeholder="e.g. One slim double-sided screen per car, mounted lengthwise on the roof so it faces the pavements on both sides."
                  onChange={(e) => onChange(refs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              </label>
              <button className="btn btn-ghost" type="button" onClick={() => onChange(refs.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {refs.length < 4 && (
        <label className="btn" style={{ alignSelf: "flex-start" }}>
          {busy ? "Uploading…" : "Add product photos"}
          <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

type Proposal = { profile: BrandProfile; logo: { light: string; dark: string | null } | null; site: { url: string; pages: number; fonts: string[] } };

/** Reads the website again and lets the owner pick what to take: logo, colours and fonts, or the words. */
function RefreshFromSite({ brand }: { brand: Brand }) {
  const [website, setWebsite] = useState(brand.profile.website ?? "");
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [take, setTake] = useState({ logo: true, look: true, words: false });

  async function read() {
    setBusy("read"); setError(""); setProposal(null);
    const res = await fetch(`/api/brands/${brand.id}/refresh-site`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Could not read the website.");
    setProposal(data);
    setTake({ logo: !!data.logo, look: true, words: false });
  }
  async function apply() {
    if (!proposal) return;
    setBusy("apply"); setError("");
    const cur = brand.profile;
    const next: BrandProfile = take.words
      ? { ...proposal.profile, colors: take.look ? proposal.profile.colors : cur.colors, fonts: take.look ? proposal.profile.fonts : cur.fonts, look: take.look ? proposal.profile.look : cur.look, imageStyle: cur.imageStyle || proposal.profile.imageStyle }
      : { ...cur, website: proposal.site.url, ...(take.look ? { colors: proposal.profile.colors, fonts: proposal.profile.fonts } : {}) };
    const body: Record<string, unknown> = { profile: next };
    if (take.logo && proposal.logo) { body.logo_on_light = proposal.logo.light; body.logo_on_dark = proposal.logo.dark ?? brand.logo_on_dark; }
    const res = await fetch(`/api/brands/${brand.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setBusy(null); return setError((await res.json().catch(() => ({}))).error ?? "Could not save."); }
    window.location.reload();
  }

  const p = proposal?.profile;
  const swatches = p ? [p.colors.primary, p.colors.dark, p.colors.light, ...p.colors.supporting] : [];
  return (
    <section className="card stack" id="refresh">
      <h2>Refresh from your website</h2>
      <p className="small muted">Changed your website? Read it again and choose what to bring in. Nothing changes until you apply it.</p>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 260px" }}>Website<input type="text" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbusiness.com" /></label>
        <button className="btn" type="button" onClick={read} disabled={busy !== null || !website.trim()}>{busy === "read" ? "Reading… (about a minute)" : "Read website"}</button>
      </div>
      {p && proposal && (
        <div className="refresh-result stack">
          <p className="notice">Read {proposal.site.pages} page{proposal.site.pages === 1 ? "" : "s"} of {new URL(proposal.site.url).hostname}. Choose what to use:</p>
          <label className="take">
            <input type="checkbox" checked={take.logo} disabled={!proposal.logo} onChange={(e) => setTake({ ...take, logo: e.target.checked })} />
            <span><strong>Logo</strong>{proposal.logo ? <span className="take-logo"><img src={proposal.logo.light} alt="Logo found on the website" /></span> : <span className="small muted"> No logo found.</span>}</span>
          </label>
          <label className="take">
            <input type="checkbox" checked={take.look} onChange={(e) => setTake({ ...take, look: e.target.checked })} />
            <span><strong>Colours and fonts</strong>
              <span className="take-swatches">{swatches.map((c, i) => <i key={i} style={{ background: c }} title={c} />)}</span>
              <span className="small muted">{p.fonts.display} / {p.fonts.body}</span>
            </span>
          </label>
          <label className="take">
            <input type="checkbox" checked={take.words} onChange={(e) => setTake({ ...take, words: e.target.checked })} />
            <span><strong>Words: one-liner, offerings, audience, voice, themes and facts</strong>
              <span className="small muted">Replaces what&rsquo;s in the Brand kit now, including your own edits. {p.oneLiner}</span>
            </span>
          </label>
          <div className="row">
            <button className="btn btn-ink" type="button" onClick={apply} disabled={busy !== null || (!take.logo && !take.look && !take.words)}>{busy === "apply" ? "Applying…" : "Apply"}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setProposal(null)} disabled={busy !== null}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
