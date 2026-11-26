import Link from "next/link";
import type { Brand } from "@/lib/types";

export function BrandHeader({ brand, current }: { brand: Brand; current: "studio" | "trends" | "media" | "calendar" | "settings" }) {
  const tabs = [
    { key: "studio", href: `/brands/${brand.id}`, label: "Ideas & posts" },
    { key: "trends", href: `/brands/${brand.id}/trends`, label: "Trend radar" },
    { key: "media", href: `/brands/${brand.id}/media`, label: "Media" },
    { key: "calendar", href: `/brands/${brand.id}/calendar`, label: "Calendar" },
    { key: "settings", href: `/brands/${brand.id}/settings`, label: "Brand profile" },
  ] as const;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row">
        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 9, background: brand.profile.colors.primary, border: "1px solid var(--line)" }} />
        <div>
          <h1>{brand.name}</h1>
          {brand.profile.oneLiner && <p className="muted small">{brand.profile.oneLiner}</p>}
        </div>
      </div>
      <nav className="tabs" aria-label={`${brand.name} sections`}>
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
    </div>
  );
}
