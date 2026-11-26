import Link from "next/link";
import { LogoMark } from "./Logo";
import { inkOn } from "@/templates/PostCanvas";
import type { Brand } from "@/lib/types";

type Section = "calendar" | "review" | "trends" | "media" | "kit";

const ICONS: Record<Section, React.ReactNode> = {
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  review: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>,
  trends: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h6v6" /></svg>,
  media: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>,
  kit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>,
};

export function BrandDot({ brand }: { brand: Brand }) {
  const c = brand.profile.colors.primary;
  return <span className="bdot" style={{ background: c, color: inkOn(c, "#111") }}>{brand.name.slice(0, 1).toUpperCase()}</span>;
}

export function Shell({ brand, brands, current, reviewCount, children }: {
  brand: Brand; brands: Brand[]; current: Section; reviewCount: number; children: React.ReactNode;
}) {
  const links: [Section, string, string][] = [
    ["calendar", `/b/${brand.id}`, "Calendar"],
    ["review", `/b/${brand.id}/review`, "To review"],
    ["trends", `/b/${brand.id}/trends`, "Trend radar"],
    ["media", `/b/${brand.id}/media`, "Photos & video"],
    ["kit", `/b/${brand.id}/kit`, "Brand kit"],
  ];
  return (
    <div className="app">
      <aside className="side" aria-label="SocialPilot">
        <Link href="/" className="logo"><LogoMark />SocialPilot</Link>
        <details className="brand-pick">
          <summary><BrandDot brand={brand} /><span>{brand.name}<small>LinkedIn · Instagram</small></span></summary>
          <div className="menu">
            {brands.filter((b) => b.id !== brand.id).map((b) => <Link key={b.id} href={`/b/${b.id}`}><BrandDot brand={b} />{b.name}</Link>)}
            <Link href="/setup"><span className="bdot" style={{ background: "var(--sunk)" }}>+</span>Add a brand</Link>
          </div>
        </details>
        <nav className="nav" aria-label="Sections">
          {links.map(([key, href, label]) => (
            <Link key={key} href={href} aria-current={key === current ? "page" : undefined}>
              {ICONS[key]}{label}
              {key === "review" && reviewCount > 0 && <span className="count">{reviewCount}</span>}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <span>Posts on {brand.settings.days.map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]).join(", ")} at {brand.settings.time}.</span>
          <a href="/logout">Sign out</a>
        </div>
      </aside>
      <main className="main" id="main">{children}</main>
    </div>
  );
}
