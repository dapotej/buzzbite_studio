import type { CSSProperties, ReactNode } from "react";
import type { BrandProfile, PostSpec } from "@/lib/types";

/** Duration of the motion template's animation, in seconds. The exporter records this long. */
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
/** Black or white, whichever reads better on the given colour. */
export const inkOn = (hex: string, dark: string) => (luminance(hex) > 0.35 ? dark : "#FFFFFF");

/** Renders *highlighted* words as accent spans. */
function Md({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <span key={i} className="acc">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

type Props = {
  brand: BrandProfile;
  spec: PostSpec;
  logoOnLight: string | null;
  logoOnDark: string | null;
  /** When false the motion template shows its finished state (for thumbnails). */
  animate?: boolean;
};

export function PostCanvas({ brand, spec, logoOnLight, logoOnDark, animate = true }: Props) {
  const { primary, dark, light } = brand.colors;
  const theme = spec.template === "motion" ? "dark" : spec.theme;
  const vars = {
    "--p": primary,
    "--on-p": inkOn(primary, dark),
    "--dark": dark,
    "--light": light,
    "--display": `'${brand.fonts.display}', 'Poppins', system-ui, sans-serif`,
    "--body": `'${brand.fonts.body}', 'Inter', system-ui, sans-serif`,
  } as CSSProperties;
  const logo = theme === "light" ? logoOnLight : logoOnDark;
  const site = brand.website.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const foot = (
    <div className="bl-foot">
      {logo ? <img src={logo} alt={brand.name} /> : <span className="bl-word">{brand.name}</span>}
      <span>{site}</span>
    </div>
  );

  let body: ReactNode;
  switch (spec.template) {
    case "statement":
      body = (
        <div className="bl-body bl-between">
          <Kicker text={spec.kicker} />
          <div className="bl-stack">
            <h1 className="bl-h bl-h-xl">
              <Md text={spec.headline} />
            </h1>
            {spec.sub && <p className="bl-sub"><Md text={spec.sub} /></p>}
          </div>
        </div>
      );
      break;
    case "stat":
      body = (
        <div className="bl-body bl-between">
          <Kicker text={spec.kicker} />
          <div>
            <div className="bl-big">{spec.big}</div>
            <h1 className="bl-h bl-h-l"><Md text={spec.headline} /></h1>
            {spec.sub && <p className="bl-sub" style={{ marginTop: 24 }}><Md text={spec.sub} /></p>}
          </div>
        </div>
      );
      break;
    case "list":
      body = (
        <div className="bl-body">
          <Kicker text={spec.kicker} />
          <h1 className="bl-h bl-h-m" style={{ marginTop: 36 }}><Md text={spec.headline} /></h1>
          <div className="bl-items">
            {spec.items.slice(0, 4).map((it, i) => (
              <div className="bl-item" key={i}>
                <span className="bl-n">{i + 1}</span>
                <div>
                  {it.title}
                  {it.detail && <small>{it.detail}</small>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case "chat":
      body = (
        <div className="bl-body bl-chat">
          {spec.bubbles.slice(0, 6).map((b, i) => (
            <div key={i} className={`bl-bub ${b.fromCustomer ? "me" : "them"}`}>{b.text}</div>
          ))}
          <h1 className="bl-h bl-h-m" style={{ marginTop: 36 }}><Md text={spec.headline} /></h1>
        </div>
      );
      break;
    case "motion":
      return <Motion spec={spec} vars={vars} logo={logoOnLight} name={brand.name} animate={animate} />;
  }

  return (
    <div className={`bl-post bl-${theme}`} style={vars}>
      <div className="bl-grid" />
      {body}
      {foot}
    </div>
  );
}

function Kicker({ text }: { text: string }) {
  if (!text) return <span />;
  return (
    <div className="bl-kicker">
      <span className="dot" />
      {text}
    </div>
  );
}

const ROUTE = "M120 300 C260 380 330 520 470 560 S700 610 760 760 S900 900 980 980";

function Motion({ spec, vars, logo, name, animate }: { spec: PostSpec; vars: CSSProperties; logo: string | null; name: string; animate: boolean }) {
  const lines = spec.lines.filter(Boolean).slice(0, 3);
  const lineStart = 1.2;
  const step = 0.9;
  const endAt = Math.min(MOTION_SECONDS - 2.4, lineStart + lines.length * step + 2.4);
  const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });
  return (
    <div className={`bl-post bl-dark bl-motion ${animate ? "" : "bl-still"}`} style={vars}>
      <div className="bl-grid" />
      <svg className="bl-route" viewBox="0 0 1080 1350" width="1080" height="1350" aria-hidden="true">
        <path d={ROUTE} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="18" strokeLinecap="round" />
        <path d={ROUTE} fill="none" stroke="var(--p)" strokeWidth="8" strokeLinecap="round" opacity="0.55" />
        <circle cx="760" cy="760" r="12" fill="var(--p)" />
      </svg>
      <div className="bl-mover" style={{ offsetPath: `path('${ROUTE}')` } as CSSProperties} />
      {spec.kicker && (
        <div className="bl-mkicker">
          <span className="dot" />
          {spec.kicker}
        </div>
      )}
      <div className="bl-lines">
        {lines.map((l, i) => (
          <div className="bl-ln" key={i} style={delay(lineStart + i * step)}>
            <Md text={l} />
          </div>
        ))}
      </div>
      <div className="bl-end" style={delay(endAt)}>
        <h2><Md text={spec.endline || spec.headline} /></h2>
        {spec.cta && <div className="bl-cta">{spec.cta}</div>}
        {logo ? <img src={logo} alt={name} /> : <span className="bl-word">{name}</span>}
      </div>
    </div>
  );
}
