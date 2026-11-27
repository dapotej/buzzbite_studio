"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Refresh button; also refreshes on its own when the numbers are over an hour old. */
export function SyncResults({ brandId, stale }: { brandId: string; stale: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  async function sync(force: boolean) {
    setBusy(true);
    await fetch(`/api/brands/${brandId}/results${force ? "?force=1" : ""}`, { method: "POST" }).catch(() => undefined);
    setBusy(false);
    router.refresh();
  }
  useEffect(() => {
    if (stale && !started.current) { started.current = true; void sync(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);
  return <button type="button" className="btn" onClick={() => sync(true)} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Engagement rate per group as horizontal bars, each labelled with its value. */
export function RateBars({ rows }: { rows: { key: string; posts: number; avgReach: number; rate: number }[] }) {
  const max = Math.max(...rows.map((r) => r.rate), 0.0001);
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.key} title={`${r.key}: ${pct(r.rate)} engagement, ${r.avgReach.toLocaleString("en-GB")} average reach, ${r.posts} post${r.posts === 1 ? "" : "s"}`}>
          <span className="bars-label">{r.key}<small> · {r.posts} post{r.posts === 1 ? "" : "s"}</small></span>
          <span className="bars-track"><span className="bars-fill" style={{ width: `${Math.max(2, (r.rate / max) * 100)}%` }} /></span>
          <span className="bars-value">{pct(r.rate)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Followers over time for one platform, with a crosshair and the value under the pointer. */
export function FollowerChart({ label, points }: { label: string; points: { day: string; followers: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const W = 520, H = 140, P = 8;
  const vals = points.map((p) => p.followers);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1));
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.followers).toFixed(1)}`).join("");
  const first = vals[0], last = vals[vals.length - 1], diff = last - first;
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const h = hover !== null ? points[hover] : null;
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((fx - P) / (W - 2 * P)) * (points.length - 1)))));
  }
  return (
    <figure className="fchart">
      <figcaption>
        <span>{label}</span>
        <b>{(h?.followers ?? last).toLocaleString("en-GB")}</b>
        <span className="small muted">{h ? fmt(h.day) : `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toLocaleString("en-GB")} since ${fmt(points[0].day)}`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} followers: ${first} on ${fmt(points[0].day)}, ${last} on ${fmt(points[points.length - 1].day)}`}
        onPointerMove={move} onPointerLeave={() => setHover(null)} preserveAspectRatio="none">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="fchart-base" />
        <path d={path} className="fchart-line" vectorEffect="non-scaling-stroke" />
        {h && hover !== null && (<>
          <line x1={x(hover)} x2={x(hover)} y1={P} y2={H - P} className="fchart-cross" vectorEffect="non-scaling-stroke" />
          <circle cx={x(hover)} cy={y(h.followers)} r={5} className="fchart-dot" />
        </>)}
      </svg>
    </figure>
  );
}
