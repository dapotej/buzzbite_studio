"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Brand, TrendReport } from "@/lib/types";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function TrendRadar({ brand, report }: { brand: Brand; report: TrendReport | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Record<number, string>>({});

  async function call(key: string, url: string, body: unknown) {
    setBusy(key); setError("");
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error ?? "Something went wrong. Try again."); return null; }
    return data;
  }
  async function research() { if (await call("research", `/api/brands/${brand.id}/trends`, {})) router.refresh(); }
  async function add(i: number) {
    const d = await call(`add${i}`, `/api/brands/${brand.id}/trends/add`, { reportId: report!.id, index: i });
    if (d) { setAdded((a) => ({ ...a, [i]: d.date })); router.refresh(); }
  }
  const day = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1 className="title">Trend radar</h1>
          <p className="sub">Post ideas from what&rsquo;s happening for {brand.name}&rsquo;s audience right now: news, events, seasons and what people are discussing. Add one to the calendar and Buzzbite creates the post.</p>
        </div>
        <button className="btn" type="button" onClick={research} disabled={busy !== null}>
          {busy === "research" ? "Searching the web… (2–3 minutes)" : report ? "Check again" : "Find ideas"}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!report ? (
        <div className="empty"><strong>No ideas yet</strong>Click Find ideas. Buzzbite searches the web for what matters to your audience this week.</div>
      ) : (
        <>
          <section className="summary"><p><b>Right now:</b> {report.summary}</p><span className="chip">Checked {when(report.created_at)}</span></section>
          <div className="ideas">
            {report.items.map((x, i) => {
              const done = added[i] || x.addedPostId;
              return (
                <article key={i} className={`idea ${done ? "added" : ""}`}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className={`chip ${x.urgency === "this week" ? "chip-wait" : ""}`}>{x.urgency[0].toUpperCase() + x.urgency.slice(1)}</span>
                    <span className="chip">{x.format[0].toUpperCase() + x.format.slice(1)}</span>
                    {x.pillar && <span className="chip">{x.pillar}</span>}
                  </div>
                  <h3>{x.title}</h3>
                  <p>{x.whyNow}</p>
                  <p><b style={{ color: "var(--ink)" }}>Post:</b> {x.recommendation}</p>
                  {x.sources.length > 0 && (
                    <div className="src">{x.sources.map((s) => /^https:\/\//.test(s.url) ? <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || new URL(s.url).hostname}</a> : null)}</div>
                  )}
                  <div className="foot">
                    {done ? (
                      <>
                        <span className="chip chip-ok">{added[i] ? `Added to ${day(added[i])}` : "Added to calendar"}</span>
                        {x.addedPostId && <Link className="btn btn-ghost" href={`/b/${brand.id}/review?post=${x.addedPostId}`}>Open</Link>}
                      </>
                    ) : (
                      <button className="btn btn-ink" type="button" onClick={() => add(i)} disabled={busy !== null}>{busy === `add${i}` ? "Creating the post…" : "Add to calendar"}</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
