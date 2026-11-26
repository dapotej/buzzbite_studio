"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TrendReport } from "@/lib/types";

const URGENCY: Record<string, string> = { "this week": "status-approved", "this month": "status-draft", evergreen: "status-draft" };

export function TrendRadar({ brandId, report }: { brandId: string; report: TrendReport | null }) {
  const router = useRouter();
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function post(key: string, url: string, body: unknown) {
    setBusy(key);
    setError("");
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(null);
      setError(data.error ?? "Something went wrong. Try again.");
      return null;
    }
    return data;
  }

  async function research() {
    if (await post("research", `/api/brands/${brandId}/trends`, { focus })) {
      setBusy(null);
      router.refresh();
    }
  }
  async function create(index: number) {
    const data = await post(`p${index}`, `/api/trends/${report!.id}/post`, { index });
    if (data) router.push(`/posts/${data.id}`);
  }

  const when = report ? new Date(report.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card stack">
        <div>
          <h2>What should we post about now?</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            Claude searches the web for news, events, seasonal moments, competitor activity and conversations in your market, then recommends posts with sources.
          </p>
        </div>
        <label className="field" htmlFor="trend-focus">
          Anything to look into? <span className="hint">Optional, e.g. &ldquo;airport passenger numbers&rdquo; or &ldquo;Lagos events in December&rdquo;.</span>
          <input id="trend-focus" type="text" value={focus} maxLength={500} onChange={(e) => setFocus(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={research} disabled={busy !== null}>
            {busy === "research" ? "Researching the web… (2-3 minutes)" : report ? "Run new research" : "Run research"}
          </button>
          {report && <span className="small muted">Last run {when}</span>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {!report ? (
        <div className="empty"><strong>No research yet</strong>Run research to see what is happening in your market and what to post about.</div>
      ) : (
        <>
          <section className="card stack">
            <h2>The picture right now</h2>
            <p>{report.summary}</p>
          </section>
          {report.items.map((t, i) => (
            <article key={i} className="idea">
              <div className="row" style={{ gap: 6 }}>
                <span className={`status ${URGENCY[t.urgency] ?? "status-draft"}`}>{t.urgency}</span>
                {t.pillar && <span className="chip">{t.pillar}</span>}
                {t.format === "video" && <span className="chip chip-video">Video</span>}
              </div>
              <h3>{t.title}</h3>
              <p><strong style={{ color: "var(--ink)" }}>Why now:</strong> {t.whyNow}</p>
              <p><strong style={{ color: "var(--ink)" }}>Post idea:</strong> {t.recommendation}</p>
              {t.sources.length > 0 && (
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {t.sources.map((s) => (
                    <li key={s.url}>
                      {/^https:\/\//.test(s.url) ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a> : s.title}
                    </li>
                  ))}
                </ul>
              )}
              <div className="row">
                <button className="btn btn-primary" type="button" onClick={() => create(i)} disabled={busy !== null}>
                  {busy === `p${i}` ? "Designing the post… (about 30 seconds)" : "Create post"}
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
