"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScaledPost } from "./PostThumb";
import { WEEKDAYS, type Brand, type Post } from "@/lib/types";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s: string) => (new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7;
const fmt = (s: string, o: Intl.DateTimeFormatOptions) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
const STATUS: Record<Post["status"], [string, string]> = {
  making: ["chip-making", "Creating…"], review: ["chip-wait", "To review"], approved: ["chip-ok", "Approved"], posted: ["chip", "Posted"],
};

export function Calendar({ brand, posts, today, view, monthStart, monthEnd, gridStart, gridEnd }: {
  brand: Brand; posts: Post[]; today: string; view: "month" | "week";
  monthStart: string; monthEnd: string; gridStart: string; gridEnd: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState(brand.settings.days);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const polling = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) if (p.publish_on) m.set(p.publish_on, [...(m.get(p.publish_on) ?? []), p]);
    return m;
  }, [posts]);
  const making = posts.some((p) => p.status === "making");
  const toReview = posts.filter((p) => p.status === "review").length;
  // Days from today (or the month start) to the month end that still need a post.
  const fillFrom = monthStart > today ? monthStart : addDays(today, 1);
  const openDays: string[] = [];
  for (let d = fillFrom; d <= monthEnd; d = addDays(d, 1)) if (days.includes(dow(d)) && !byDay.has(d)) openDays.push(d);
  const monthName = fmt(monthStart, { month: "long" });

  // While photos and clips are being made, check on them every 6 seconds.
  useEffect(() => {
    if (!making) return;
    const tick = async () => {
      await fetch(`/api/brands/${brand.id}/advance`, { method: "POST" }).catch(() => undefined);
      router.refresh();
    };
    polling.current = setTimeout(tick, 6000);
    return () => { if (polling.current) clearTimeout(polling.current); };
  }, [making, posts, brand.id, router]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  async function toggleDay(d: number) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    if (!next.length) return;
    setDays(next);
    await fetch(`/api/brands/${brand.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: { ...brand.settings, days: next } }) });
    router.refresh();
  }

  async function fill() {
    setBusy("fill"); setError(""); setProgress(0.05);
    const total = openDays.length;
    let remaining = total;
    try {
      while (remaining > 0) {
        const res = await fetch(`/api/brands/${brand.id}/fill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: fillFrom, to: monthEnd }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not create the posts.");
        if (!data.made) break;
        remaining = data.remaining;
        setProgress(Math.max(0.05, (total - remaining) / total));
        router.refresh();
      }
      setToast(`${total - remaining} posts created. Photos and videos are being made now.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null); setProgress(0); router.refresh();
    }
  }

  const prev = fmt(addDays(monthStart, -1), { year: "numeric", month: "2-digit" }).split("/").reverse().join("-");
  const next = fmt(addDays(monthEnd, 1), { year: "numeric", month: "2-digit" }).split("/").reverse().join("-");
  const weekStart = view === "week" ? (today >= gridStart && today <= gridEnd ? addDays(today, -dow(today)) : gridStart) : gridStart;
  const rows: string[][] = [];
  for (let w = weekStart; w <= (view === "week" ? weekStart : gridEnd); w = addDays(w, 7)) rows.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <div className="row" style={{ gap: 6 }}>
            <Link className="btn btn-ghost" href={`/b/${brand.id}?m=${prev}&view=${view}`} aria-label="Previous month">←</Link>
            <h1 className="title">{fmt(monthStart, { month: "long", year: "numeric" })}</h1>
            <Link className="btn btn-ghost" href={`/b/${brand.id}?m=${next}&view=${view}`} aria-label="Next month">→</Link>
          </div>
          <p className="sub">
            {posts.length === 0
              ? `Choose your posting days. SocialPilot creates ${monthName}'s posts for you: photos, videos and captions, in ${brand.name}'s look.`
              : making ? "Photos and videos are being created. Posts move to review as they finish."
              : toReview ? `${toReview} posts are waiting for your OK.` : "Everything this month is approved."}
          </p>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="View">
            <Link href={`/b/${brand.id}?m=${monthStart.slice(0, 7)}&view=month`} aria-current={view === "month" ? "page" : undefined}>Month</Link>
            <Link href={`/b/${brand.id}?m=${monthStart.slice(0, 7)}&view=week`} aria-current={view === "week" ? "page" : undefined}>Week</Link>
          </div>
          {toReview > 0 && <Link className="btn btn-ink" href={`/b/${brand.id}/review`}>Review {toReview} posts</Link>}
        </div>
      </div>

      <section className="pilot" aria-label="Posting plan">
        <div>
          <div className="pilot-label">Post on</div>
          <div className="days" role="group" aria-label="Posting days">
            {WEEKDAYS.map((d, i) => <button key={d} type="button" aria-pressed={days.includes(i)} aria-label={d} onClick={() => toggleDay(i)}>{d[0]}</button>)}
          </div>
        </div>
        <div>
          <div className="pilot-label">Mix</div>
          <div className="row" style={{ gap: 6 }}><span className="chip chip-acc">Photos</span><span className="chip chip-acc">Video</span><span className="chip chip-acc">Graphics</span><span className="chip">{days.length} a week</span></div>
        </div>
        <span className="spacer" />
        {openDays.length > 0 ? (
          <button className="btn btn-ink btn-lg" type="button" onClick={fill} disabled={busy !== null}>
            {busy === "fill" ? `Writing posts… ${Math.round(progress * 100)}%` : posts.length ? `Fill ${openDays.length} empty days` : `Create ${monthName}'s posts`}
          </button>
        ) : <span className="chip chip-ok">Every posting day has a post</span>}
        {busy === "fill" && <div className="progress" aria-hidden="true"><div style={{ width: `${progress * 100}%` }} /></div>}
        {error && <p className="error" role="alert" style={{ flexBasis: "100%" }}>{error}</p>}
      </section>

      <div className="cal-wrap">
        <div className={`cal ${view === "week" ? "week" : ""}`}>
          <div className="cal-head">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
          {rows.map((r) => (
            <div className="cal-row" key={r[0]}>
              {r.map((date) => {
                const dayPosts = byDay.get(date) ?? [];
                const inMonth = date >= monthStart && date <= monthEnd;
                const planned = days.includes(dow(date)) && inMonth && date > today;
                return (
                  <div key={date} className={`cell ${inMonth ? "" : "out"} ${date === today ? "today" : ""}`}>
                    <span className="dnum">{fmt(date, { day: "numeric" })}{date.endsWith("-01") ? " " + fmt(date, { month: "short" }) : ""}</span>
                    {dayPosts.map((p) => (
                      <Link key={p.id} href={`/b/${brand.id}/review?post=${p.id}`} className="cpost" aria-label={p.title || "Post"}>
                        <ScaledPost brand={brand.profile} spec={p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} />
                        <span className={`st chip ${STATUS[p.status][0]}`}>{STATUS[p.status][1]}</span>
                      </Link>
                    ))}
                    {!dayPosts.length && planned && <div className="slot-add">{busy === "fill" ? "Writing…" : "Post day"}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
