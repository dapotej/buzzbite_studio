"use client";
import Link from "next/link";
import { useState } from "react";

export type AlertItem = { id: string; brand_id: string; post_id: string | null; kind: string; message: string; post_title: string | null; publish_on: string | null };

const LABEL: Record<string, string> = { media: "Couldn't make the photo or video", schedule: "Couldn't schedule", publish: "Didn't go out" };
const day = (d: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

/** Things that went wrong while no one was watching. Each links to the post to fix it. */
export function Alerts({ alerts }: { alerts: AlertItem[] }) {
  const [shown, setShown] = useState(alerts);
  if (!shown.length) return null;
  async function dismiss(id: string) {
    setShown((s) => s.filter((a) => a.id !== id));
    await fetch(`/api/alerts/${id}`, { method: "DELETE" }).catch(() => undefined);
  }
  return (
    <section className="alerts" aria-label="Needs your attention">
      <strong>{shown.length === 1 ? "1 post needs your attention" : `${shown.length} posts need your attention`}</strong>
      <ul>
        {shown.slice(0, 5).map((a) => (
          <li key={a.id}>
            <span className="alert-text">
              <b>{LABEL[a.kind] ?? "Problem"}{a.publish_on ? ` · ${day(a.publish_on)}` : ""}:</b>{" "}
              {a.post_id ? <Link href={`/b/${a.brand_id}/review?post=${a.post_id}`}>{a.post_title ?? "Open post"}</Link> : null}
              <span className="muted"> {a.message}</span>
            </span>
            <button type="button" className="btn btn-ghost alert-x" onClick={() => dismiss(a.id)} aria-label="Dismiss">Dismiss</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
