import type { CSSProperties, ReactNode } from "react";
import type { BrandProfile, PostSpec } from "@/lib/types";

/** Length of the animated-graphic template, in seconds. Video posts use their clip's length. */
export const MOTION_SECONDS = 9;
export const POST_W = 1080;
export const POST_H = 1350;

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
/** The brand's dark colour or white, whichever reads better on the given colour. */
export const inkOn = (hex: string, dark: string) => (luminance(hex) > 0.35 ? dark : "#FFFFFF");

/** Renders *highlighted* words as accent spans. */
function Md({ text }: { text: string }) {
  const parts = (text || "").split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? <span key={i} className="acc">{p.slice(1, -1)}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

type Props = {
  brand: BrandProfile;
  spec: PostSpec;
  logoOnLight: string | null;
  logoOnDark: string | null;
  /** False for thumbnails: animations show their finished state and clips show their first frame. */
  animate?: boolean;
  /** Carousels: which slide to show (0 = cover). */
  slide?: number;
};

export function PostCanvas({ brand, spec, logoOnLight, logoOnDark, animate = true, slide = 0 }: Props) {
  const { primary, dark, light } = brand.colors;
  const sup = (brand.colors.supporting ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const s = (i: number) => (sup.length ? sup[i % sup.length] : primary);
  const vars = {
    "--p": primary, "--on-p": inkOn(primary, dark), "--dark": dark, "--light": light,
    "--s1": s(0), "--s2": s(1), "--s3": s(2), "--s4": s(3),
    "--on-s1": inkOn(s(0), dark), "--on-s2": inkOn(s(1), dark), "--on-s3": inkOn(s(2), dark), "--on-s4": inkOn(s(3), dark),
    "--display": `'${brand.fonts.display}', 'Poppins', system-ui, sans-serif`,
    "--body": `'${brand.fonts.body}', 'Inter', system-ui, sans-serif`,
  } as CSSProperties;
  const site = brand.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const foot = (on: "light" | "dark") => {
    const logo = on === "light" ? logoOnLight : logoOnDark;
    return (
      <div className={`bl-foot bl-foot-${on}`}>
        {logo ? <img src={logo} alt={brand.name} /> : <span className="bl-word">{brand.name}</span>}
        <span>{site}</span>
      </div>
    );
  };
  const still = animate ? "" : " bl-still";
  const wrap = (cls: string, body: ReactNode) => <div className={`bl-post ${cls}${still}`} style={vars}>{body}</div>;

  switch (spec.template) {
    case "photo":
      return wrap("bl-dark bl-photo", <>
        <Media spec={spec} animate={animate} />
        <div className="bl-shade" />
        {spec.kicker && <span className="bl-chip bl-chip-p">{spec.kicker}</span>}
        <div className="bl-bottom"><h1 className="bl-h bl-h-xl"><Md text={spec.headline} /></h1>{spec.sub && <p className="bl-sub"><Md text={spec.sub} /></p>}</div>
        {foot("dark")}
      </>);
    case "photo_band":
      return wrap("bl-band", <>
        <Media spec={spec} animate={animate} className="bl-band-ph" />
        {spec.kicker && <span className="bl-chip bl-chip-dark">{spec.kicker}</span>}
        <div className="bl-band-box"><h1 className="bl-h bl-h-l"><Md text={spec.headline} /></h1>{spec.sub && <p className="bl-sub"><Md text={spec.sub} /></p>}</div>
        {foot(inkOn(primary, dark) === "#FFFFFF" ? "dark" : "light")}
      </>);
    case "photo_frame":
      return wrap("bl-light bl-frame", <>
        <h1 className="bl-h bl-h-l bl-frame-h"><Md text={spec.headline} /></h1>
        <Media spec={spec} animate={animate} className="bl-frame-ph" />
        {spec.note && <div className="bl-frame-note">{spec.note}</div>}
        {foot("light")}
      </>);
    case "photo_stat":
      return wrap("bl-dark bl-photo", <>
        <Media spec={spec} animate={animate} />
        <div className="bl-shade bl-shade-low" />
        <div className="bl-circ"><b>{spec.big}</b><span>{spec.bigLabel}</span></div>
        <div className="bl-bottom"><h1 className="bl-h bl-h-xl" style={{ fontSize: 100 }}><Md text={spec.headline} /></h1></div>
        {foot("dark")}
      </>);
    case "video": {
      const lines = (spec.lines.length ? spec.lines : [spec.headline]).filter(Boolean).slice(0, 3);
      return wrap("bl-dark bl-photo bl-vid", <>
        <Media spec={spec} animate={animate} kenBurns />
        <div className="bl-shade" />
        {spec.kicker && <span className="bl-chip bl-chip-live"><i />{spec.kicker}</span>}
        <div className="bl-bottom">{lines.map((l, i) => <div key={i} className="bl-vl" style={{ animationDelay: `${0.3 + i * 0.6}s` }}><Md text={l} /></div>)}</div>
        {foot("dark")}
      </>);
    }
    case "statement":
      return wrap(`bl-${spec.theme}`, <>
        <div className="bl-grid" />
        <div className="bl-body bl-between">
          <Kicker text={spec.kicker} />
          <div className="bl-stack"><h1 className="bl-h bl-h-xl"><Md text={spec.headline} /></h1>{spec.sub && <p className="bl-sub"><Md text={spec.sub} /></p>}</div>
        </div>
        {foot(spec.theme)}
      </>);
    case "stat":
      return wrap(`bl-${spec.theme}`, <>
        <div className="bl-grid" />
        <div className="bl-body bl-between">
          <Kicker text={spec.kicker} />
          <div>
            <div className="bl-big">{spec.big}</div>
            <div className="bl-bar" aria-hidden="true"><i style={{ background: "var(--p)" }} /><i style={{ background: "var(--s1)" }} /><i style={{ background: "var(--s2)" }} /><i style={{ background: "var(--s3)" }} /></div>
            <h1 className="bl-h bl-h-l"><Md text={spec.headline} /></h1>
            {spec.sub && <p className="bl-sub" style={{ marginTop: 24 }}><Md text={spec.sub} /></p>}
          </div>
        </div>
        {foot(spec.theme)}
      </>);
    case "list":
      return wrap(`bl-${spec.theme}`, <>
        <div className="bl-grid" />
        <div className="bl-body">
          <Kicker text={spec.kicker} />
          <h1 className="bl-h bl-h-m" style={{ marginTop: 36 }}><Md text={spec.headline} /></h1>
          <div className="bl-items">
            {spec.items.slice(0, 4).map((it, i) => (
              <div className="bl-item" key={i}>
                <span className="bl-n" style={{ background: `var(--s${(i % 4) + 1})`, color: `var(--on-s${(i % 4) + 1})` }}>{i + 1}</span>
                <div>{it.title}{it.detail && <small>{it.detail}</small>}</div>
              </div>
            ))}
          </div>
        </div>
        {foot(spec.theme)}
      </>);
    case "chat":
      return wrap(`bl-${spec.theme}`, <>
        <div className="bl-grid" />
        <div className="bl-body bl-chat">
          {spec.bubbles.slice(0, 6).map((b, i) => <div key={i} className={`bl-bub ${b.fromCustomer ? "me" : "them"}`}>{b.text}</div>)}
          <h1 className="bl-h bl-h-m" style={{ marginTop: 36 }}><Md text={spec.headline} /></h1>
        </div>
        {foot(spec.theme)}
      </>);
    case "poster":
      return wrap("bl-light bl-poster", <>
        <h1 className="bl-poster-big">{(spec.big || spec.kicker || "").split(/\s+/).filter(Boolean).map((w, i) => <span key={i}>{w}</span>)}</h1>
        <div className="bl-poster-dot" /><div className="bl-poster-bar" />
        <div className="bl-poster-on"><Md text={spec.headline} /></div>
        {(spec.note || spec.sub) && <p className="bl-poster-small">{spec.note || spec.sub}</p>}
        {foot("light")}
      </>);
    case "carousel": {
      const slides = spec.slides.length ? spec.slides : [{ layout: "cover" as const, kicker: spec.kicker, headline: spec.headline, body: spec.sub, big: "" }];
      const i = Math.min(Math.max(0, slide), slides.length - 1);
      const sl = slides[i];
      const count = <span className="bl-count">{i + 1}/{slides.length}</span>;
      const pointNo = slides.slice(0, i + 1).filter((x) => x.layout === "point").length;
      if (sl.layout === "cover") {
        const photo = !!spec.media?.url || !!spec.imagePrompt.trim();
        return wrap(`bl-dark ${photo ? "bl-photo" : ""} bl-car`, <>
          {photo ? <><Media spec={spec} animate={animate} /><div className="bl-shade" /></> : <div className="bl-grid" />}
          {count}
          {sl.kicker && <span className="bl-chip bl-chip-p">{sl.kicker}</span>}
          <div className="bl-bottom">
            <h1 className="bl-h bl-h-xl"><Md text={sl.headline} /></h1>
            {sl.body && <p className="bl-sub"><Md text={sl.body} /></p>}
            <span className="bl-swipe">Swipe <i>→</i></span>
          </div>
          {foot("dark")}
        </>);
      }
      if (sl.layout === "cta") {
        return wrap("bl-band bl-car bl-car-cta", <>
          {count}
          <div className="bl-car-mid">
            <h1 className="bl-h bl-h-xl"><Md text={sl.headline} /></h1>
            {sl.body && <p className="bl-car-body">{sl.body}</p>}
          </div>
          {foot(inkOn(primary, dark) === "#FFFFFF" ? "dark" : "light")}
        </>);
      }
      const theme = i % 2 ? "light" : "dark";
      return wrap(`bl-${theme} bl-car`, <>
        <div className="bl-grid" />
        {count}
        <div className="bl-car-mid">
          {sl.kicker && <div className="bl-kicker"><span className="dot" />{sl.kicker}</div>}
          {sl.layout === "point" && <span className="bl-car-n" style={{ background: `var(--s${((pointNo - 1) % 4) + 1})`, color: `var(--on-s${((pointNo - 1) % 4) + 1})` }}>{pointNo}</span>}
          {sl.layout === "stat" && sl.big && <div className="bl-big">{sl.big}</div>}
          {sl.layout === "quote" && <span className="bl-car-q" aria-hidden="true">“</span>}
          <h1 className={`bl-h ${sl.layout === "quote" ? "bl-h-m" : "bl-h-l"}`}><Md text={sl.headline} /></h1>
          {sl.body && <p className="bl-car-body">{sl.body}</p>}
        </div>
        {foot(theme)}
      </>);
    }
    case "motion":
    default:
      return <Motion spec={spec} vars={vars} logo={logoOnLight} name={brand.name} animate={animate} />;
  }
}

/** The post's photo, or its video clip when there is one. */
function Media({ spec, animate, className = "", kenBurns = false }: { spec: PostSpec; animate: boolean; className?: string; kenBurns?: boolean }) {
  const cls = `bl-ph ${className}`;
  if (animate && spec.clip?.url) {
    return <video className={cls} src={spec.clip.url} poster={spec.media?.url} crossOrigin="anonymous" muted loop playsInline autoPlay preload="auto" />;
  }
  if (spec.media?.url) {
    // Thumbnails load a small, resized copy; the full photo is used for previews and downloads.
    const src = !animate && spec.media.url.includes(".public.blob.vercel-storage.com")
      ? `/_next/image?url=${encodeURIComponent(spec.media.url)}&w=384&q=70`
      : spec.media.url;
    return <img className={`${cls}${kenBurns && !spec.clip ? " bl-kb" : ""}`} src={src} crossOrigin="anonymous" alt="" loading={animate ? "eager" : "lazy"} decoding="async" />;
  }
  return <div className={`${cls} bl-ph-wait`}><span>Photo not ready yet</span></div>;
}

function Kicker({ text }: { text: string }) {
  if (!text) return <span />;
  return <div className="bl-kicker"><span className="dot" />{text}</div>;
}

const ROUTE = "M120 300 C260 380 330 520 470 560 S700 610 760 760 S900 900 980 980";

function Motion({ spec, vars, logo, name, animate }: { spec: PostSpec; vars: CSSProperties; logo: string | null; name: string; animate: boolean }) {
  const lines = spec.lines.filter(Boolean).slice(0, 3);
  const lineStart = 1.2, step = 0.9;
  const endAt = Math.min(MOTION_SECONDS - 2.4, lineStart + lines.length * step + 2.4);
  const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });
  return (
    <div className={`bl-post bl-dark bl-motion ${animate ? "" : "bl-still"}`} style={vars}>
      <div className="bl-grid" />
      <svg className="bl-route" viewBox="0 0 1080 1350" width="1080" height="1350" aria-hidden="true">
        <path d={ROUTE} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="18" strokeLinecap="round" />
        <path d={ROUTE} fill="none" stroke="var(--p)" strokeWidth="8" strokeLinecap="round" opacity="0.55" />
        <circle cx="300" cy="420" r="12" fill="var(--s1)" /><circle cx="560" cy="590" r="12" fill="var(--s2)" />
        <circle cx="760" cy="760" r="12" fill="var(--s3)" /><circle cx="900" cy="920" r="12" fill="var(--s4)" />
      </svg>
      <div className="bl-mover" style={{ offsetPath: `path('${ROUTE}')` } as CSSProperties} />
      {spec.kicker && <div className="bl-mkicker"><span className="dot" />{spec.kicker}</div>}
      <div className="bl-lines">{lines.map((l, i) => <div className="bl-ln" key={i} style={delay(lineStart + i * step)}><Md text={l} /></div>)}</div>
      <div className="bl-end" style={delay(endAt)}>
        <h2><Md text={spec.endline || spec.headline} /></h2>
        {spec.cta && <div className="bl-cta">{spec.cta}</div>}
        {logo ? <img src={logo} alt={name} /> : <span className="bl-word">{name}</span>}
      </div>
    </div>
  );
}
