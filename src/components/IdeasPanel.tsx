"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Idea } from "@/lib/types";

export function IdeasPanel({ brandId, ideas, hasPillars }: { brandId: string; ideas: Idea[]; hasPillars: boolean }) {
  const router = useRouter();
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function call(key: string, url: string, init: RequestInit, then: (data: Record<string, unknown>) => void) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      then(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  const generate = () =>
    call("gen", `/api/brands/${brandId}/ideas`, { method: "POST", body: JSON.stringify({ count: 8, focus }) }, () => {
      setBusy(null);
      setFocus("");
      router.refresh();
    });
  const create = (id: string) =>
    call(id, "/api/posts", { method: "POST", body: JSON.stringify({ ideaId: id }) }, (d) => router.push(`/posts/${d.id}`));
  const dismiss = (id: string) =>
    call(`x${id}`, `/api/ideas/${id}`, { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) }, () => {
      setBusy(null);
      router.refresh();
    });

  return (
    <section className="stack" aria-labelledby="ideas-h">
      <h2 id="ideas-h">Ideas</h2>
      {!hasPillars && (
        <p className="notice small">
          This brand has no content pillars yet. <Link href={`/brands/${brandId}/settings`}>Add some in the brand profile</Link> for sharper ideas.
        </p>
      )}
      <div className="card stack">
        <label className="field" htmlFor="focus">
          Anything to focus on? <span className="hint">Optional: a launch, an event, a season, a customer question.</span>
          <input id="focus" type="text" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. December travel season" maxLength={500} />
        </label>
        <button className="btn btn-primary" type="button" onClick={generate} disabled={busy !== null}>
          {busy === "gen" ? "Thinking up ideas… (about 30 seconds)" : "Give me 8 ideas"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {ideas.length === 0 ? (
        <div className="empty"><strong>No ideas yet</strong>Ask for ideas and they will appear here.</div>
      ) : (
        ideas.map((i) => (
          <article className="idea" key={i.id}>
            <div className="row" style={{ gap: 6 }}>
              {i.pillar && <span className="chip">{i.pillar}</span>}
              {i.format === "video" && <span className="chip chip-video">Video</span>}
            </div>
            <h3>{i.title}</h3>
            <p>{i.angle}</p>
            <div className="row">
              <button className="btn btn-primary" type="button" onClick={() => create(i.id)} disabled={busy !== null}>
                {busy === i.id ? "Designing the post… (about 30 seconds)" : "Create post"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => dismiss(i.id)} disabled={busy !== null}>Dismiss</button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
