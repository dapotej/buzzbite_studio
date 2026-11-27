"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScaledPost } from "./PostThumb";
import { WEEKDAYS, type Brand, type Post, type TrendItem } from "@/lib/types";

export type CalendarIdea = TrendItem & { index: number; reportId: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s: string) => (new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7;
const fmt = (s: string, o: Intl.DateTimeFormatOptions) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
const STATUS: Record<Post["status"], [string, string]> = {
  making: ["chip-making", "Creating…"], review: ["chip-wait", "To review"], approved: ["chip-ok", "Approved"], posted: ["chip", "Posted"],
};
function chipFor(p: Post): [string, string] {
  if (p.issue) return ["chip-issue", "Needs attention"];
  if (p.status === "approved") {
    if (p.publishing.state === "failed") return ["chip-fail", "Failed"];
    if (p.publishing.error) return ["chip-fail", "Not scheduled"];
    if (p.publishing.state === "scheduled") return ["chip-sched", "Scheduled"];
    if (p.publishing.state === "publishing") return ["chip-sched", "Posting…"];
  }
  return STATUS[p.status];
}

export function Calendar({ brand, posts: serverPosts, ideas, today, view, monthStart, monthEnd, gridStart, gridEnd }: {
  brand: Brand; posts: Post[]; ideas: CalendarIdea[]; today: string; view: "month" | "week";
  monthStart: string; monthEnd: string; gridStart: string; gridEnd: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState(brand.settings.days);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const polling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState<"any" | "photo" | "video" | "carousel" | "graphic">("any");
  // Dragging a post to another day: moved dates show immediately, then save.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const posts = useMemo(() => serverPosts.map((p) => (moved[p.id] ? { ...p, publish_on: moved[p.id] } : p)), [serverPosts, moved]);
  useEffect(() => { setMoved({}); }, [serverPosts]);

  async function moveTo(postId: string, date: string) {
    const p = posts.find((x) => x.id === postId);
    if (!p || p.publish_on === date) return;
    setMoved((m) => ({ ...m, [postId]: date }));
    const res = await fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ publish_on: date }) });
    if (!res.ok) { setMoved((m) => { const n = { ...m }; delete n[postId]; return n; }); setError("Could not move the post. Try again."); return; }
    setToast(`Moved to ${fmt(date, { weekday: "short", day: "numeric", month: "short" })}.`);
    router.refresh();
  }

  async function createFromIdea(idea: CalendarIdea, date: string) {
    setBusy(`day-${date}`); setError("");
    try {
      const res = await fetch(`/api/brands/${brand.id}/trends/add`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId: idea.reportId, index: idea.index, date }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the post.");
      setPick(null);
      setToast("Post created from the idea. Its photo or video is being made now.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function createFor(date: string) {
    setBusy(`day-${date}`); setError("");
    try {
      const res = await fetch(`/api/brands/${brand.id}/posts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, brief, format }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the post.");
      setPick(null); setBrief(""); setFormat("any");
      setToast("Post created. Its photo or video is being made now.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) if (p.publish_on) m.set(p.publish_on, [...(m.get(p.publish_on) ?? []), p]);
    return m;
  }, [posts]);
  const making = posts.some((p) => p.status === "making");
  // Pick up the results of posts that were due to go out, and keep checking while any are due today.
  const dueNow = brand.social.accounts.length > 0 && posts.some((p) => (p.publishing.state === "scheduled" || p.publishing.state === "publishing") && p.publish_on !== null && p.publish_on <= today);
  useEffect(() => {
    if (!dueNow) return;
    let stop = false;
    const run = async () => {
      const data = await fetch(`/api/brands/${brand.id}/sync`, { method: "POST" }).then((r) => r.json()).catch(() => ({}));
      if (!stop && data.changed) router.refresh();
    };
    run();
    const t = setInterval(run, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [dueNow, brand.id, router]);
  const needsAttention = posts.filter((p) => p.issue).length;

  async function retryAll() {
    setBusy("retry"); setError("");
    const res = await fetch(`/api/brands/${brand.id}/retry-all`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Could not try again.");
    if (data.failed) setError(data.issue ?? "Some photos still could not be made.");
    else setToast(`Trying again for ${data.retried} posts. Photos appear in a minute or two.`);
    router.refresh();
  }
  const toReview = posts.filter((p) => p.status === "review").length;
  // Days from today (or the month start) to the month end that still need a post.
  const fillFrom = monthStart > today ? monthStart : addDays(today, 1);
  const openDays: string[] = [];
  for (let d = fillFrom; d <= monthEnd; d = addDays(d, 1)) if (days.includes(dow(d)) && !byDay.has(d)) openDays.push(d);
  const monthName = fmt(monthStart, { month: "long" });
  // Phone agenda: this month's days that have posts or are posting days still to come.
  const agendaDays: string[] = [];
  for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) if (byDay.has(d) || (days.includes(dow(d)) && d >= today)) agendaDays.push(d);

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
              ? `Choose your posting days. Buzzbite creates ${monthName}'s posts for you: photos, videos and captions, in ${brand.name}'s look.`
              : making ? "Photos and videos are being created. Posts move to review as they finish."
              : toReview ? `${toReview} post${toReview === 1 ? " is" : "s are"} waiting for your OK.` : "Everything this month is approved."}
          </p>
        </div>
        <div className="row">
          <div className="seg view-seg" role="group" aria-label="View">
            <Link href={`/b/${brand.id}?m=${monthStart.slice(0, 7)}&view=month`} aria-current={view === "month" ? "page" : undefined}>Month</Link>
            <Link href={`/b/${brand.id}?m=${monthStart.slice(0, 7)}&view=week`} aria-current={view === "week" ? "page" : undefined}>Week</Link>
          </div>
          {toReview > 0 && <Link className="btn btn-ink" href={`/b/${brand.id}/review`}>Review {toReview} post{toReview === 1 ? "" : "s"}</Link>}
        </div>
      </div>

      {needsAttention > 0 && (
        <div className="issue" role="alert" style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}>{needsAttention} post{needsAttention === 1 ? "" : "s"} could not get a photo or video. Open one to see why, or try them all again.</span>
          <button className="btn" type="button" onClick={retryAll} disabled={busy !== null}>{busy === "retry" ? "Trying again…" : "Try all again"}</button>
        </div>
      )}

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

      {/* Phones: a list of the month's posting days instead of the grid. */}
      <ol className="agenda" aria-label={`${monthName} posts`}>
        {agendaDays.length === 0 && <li className="agenda-empty">No posting days left this month. Choose days above, or go to next month.</li>}
        {agendaDays.map((date) => {
          const dayPosts = byDay.get(date) ?? [];
          return (
            <li key={date} className={`agenda-day ${date === today ? "today" : ""}`}>
              <div className="agenda-date"><strong>{fmt(date, { weekday: "short" })}</strong><span>{fmt(date, { day: "numeric", month: "short" })}</span></div>
              <div className="agenda-posts">
                {dayPosts.map((p) => (
                  <Link key={p.id} href={`/b/${brand.id}/review?post=${p.id}`} className="agenda-post">
                    <span className="agenda-thumb"><ScaledPost brand={brand.profile} spec={p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} badge={false} /></span>
                    <span className="agenda-text"><strong>{p.title || p.spec.headline.replace(/\*/g, "")}</strong><span className={`chip ${chipFor(p)[0]}`}>{chipFor(p)[1]}</span></span>
                  </Link>
                ))}
                {date >= today && (
                  <button type="button" className={dayPosts.length ? "agenda-add" : "agenda-slot"} onClick={() => setPick(date)} disabled={busy !== null}>
                    {busy === `day-${date}` ? "Creating…" : busy === "fill" && !dayPosts.length ? "Writing…" : dayPosts.length ? "+ Add another post" : "+ Create post"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="cal-wrap">
        <div className={`cal ${view === "week" ? "week" : ""}`}>
          <div className="cal-head">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
          {rows.map((r) => (
            <div className="cal-row" key={r[0]}>
              {r.map((date) => {
                const dayPosts = byDay.get(date) ?? [];
                const inMonth = date >= monthStart && date <= monthEnd;
                const planned = days.includes(dow(date)) && inMonth && date > today;
                const canAdd = date >= today;
                return (
                  <div key={date} className={`cell ${inMonth ? "" : "out"} ${date === today ? "today" : ""} ${overDay === date && dragging ? "drop" : ""}`}
                    onDragOver={(e) => { if (dragging && canAdd) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overDay !== date) setOverDay(date); } }}
                    onDragLeave={() => setOverDay((d) => (d === date ? null : d))}
                    onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/x-post") || dragging; setOverDay(null); setDragging(null); if (id && canAdd) moveTo(id, date); }}>
                    <span className="dnum">{fmt(date, { day: "numeric" })}{date.endsWith("-01") ? " " + fmt(date, { month: "short" }) : ""}</span>
                    {dayPosts.map((p) => (
                      <Link key={p.id} href={`/b/${brand.id}/review?post=${p.id}`} className={`cpost ${dragging === p.id ? "is-dragging" : ""}`} aria-label={p.title || "Post"}
                        draggable={p.status !== "posted"} onDragStart={(e) => { e.dataTransfer.setData("text/x-post", p.id); e.dataTransfer.effectAllowed = "move"; setDragging(p.id); }}
                        onDragEnd={() => { setDragging(null); setOverDay(null); }}>
                        <ScaledPost brand={brand.profile} spec={p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} />
                        <span className={`st chip ${chipFor(p)[0]}`}>{chipFor(p)[1]}</span>
                      </Link>
                    ))}
                    {!dayPosts.length && planned && (
                      <button type="button" className="slot-add" onClick={() => setPick(date)} disabled={busy !== null}>
                        {busy === "fill" ? "Writing…" : busy === `day-${date}` ? "Creating…" : "+ Create post"}
                      </button>
                    )}
                    {canAdd && (dayPosts.length > 0 || !planned) && (
                      <button type="button" className="day-add" onClick={() => setPick(date)} disabled={busy !== null} aria-label={`Create a post for ${fmt(date, { weekday: "long", day: "numeric", month: "long" })}`}>
                        {busy === `day-${date}` ? "Creating…" : "+ Add post"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {pick && (
        <div className="dialog-back" onClick={(e) => { if (e.target === e.currentTarget && !busy) setPick(null); }}>
          <form className="dialog card stack" role="dialog" aria-modal="true" aria-labelledby="day-title" onSubmit={(e) => { e.preventDefault(); createFor(pick); }}>
            <h2 id="day-title">Create a post for {fmt(pick, { weekday: "long", day: "numeric", month: "long" })}</h2>
            {ideas.length > 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                <span className="small" style={{ fontWeight: 600 }}>Ideas from Trend radar</span>
                <div className="idea-pick">
                  {ideas.slice(0, 6).map((i) => (
                    <button key={`${i.reportId}-${i.index}`} type="button" onClick={() => createFromIdea(i, pick)} disabled={busy !== null}>
                      <span className="row" style={{ gap: 6 }}>
                        <span className={`chip ${i.urgency === "this week" ? "chip-wait" : ""}`}>{i.urgency}</span>
                        <span className="chip">{i.format}</span>
                      </span>
                      <b>{i.title}</b>
                      <span className="small muted">{i.recommendation}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="small muted">No trend ideas yet. <Link href={`/b/${brand.id}/trends`}>Find ideas in Trend radar</Link>, or describe the post below.</p>
            )}
            <label className="field">{ideas.length ? "Or say what it should be about" : "What should it be about?"} <span className="hint">Optional. Leave empty and Buzzbite picks the best topic for the day.</span>
              <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={1000} placeholder="e.g. Our new airport screens in Abuja" autoFocus />
            </label>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>Type of post</span>
              <div className="seg" role="group" aria-label="Type of post">
                {([["any", "Let Buzzbite choose"], ["photo", "Photo"], ["video", "Video"], ["carousel", "Carousel"], ["graphic", "Graphic"]] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={format === k} onClick={() => setFormat(k)}>{l}</button>
                ))}
              </div>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row">
              <button className="btn btn-ink" type="submit" disabled={busy !== null}>{busy ? "Creating the post… (about 30 seconds)" : "Create post"}</button>
              <button className="btn btn-ghost" type="button" onClick={() => setPick(null)} disabled={busy !== null}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
