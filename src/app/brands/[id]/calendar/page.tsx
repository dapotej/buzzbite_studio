import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { ScaledPost } from "@/components/PostThumb";
import { TopBar } from "@/components/TopBar";
import { getBrand, listPosts } from "@/lib/db";
import type { Post } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function Calendar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await getBrand(id);
  if (!brand) notFound();
  const posts = await listPosts(id);
  const byDay = new Map<string, Post[]>();
  for (const p of posts) if (p.publish_on) byDay.set(p.publish_on, [...(byDay.get(p.publish_on) ?? []), p]);
  const unscheduled = posts.filter((p) => !p.publish_on);

  const now = new Date();
  const today = ymd(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  const start = new Date(today + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // Monday this week
  const weeks = Array.from({ length: 5 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const x = new Date(start);
      x.setUTCDate(start.getUTCDate() + w * 7 + d);
      return ymd(x);
    }),
  );

  return (
    <>
      <TopBar />
      <main className="page">
        <BrandHeader brand={brand} current="calendar" />
        <p className="muted">Give a post a publish date in the editor and it appears here. The next five weeks are shown.</p>
        <div className="cal-wrap">
          <div className="cal-inner">
            <div className="cal">{DAYS.map((d) => <div key={d} className="cal-head">{d}</div>)}</div>
            {weeks.map((week) => (
              <div className="cal" key={week[0]}>
                {week.map((day) => (
                  <div key={day} className={`cal-day ${day === today ? "today" : ""}`}>
                    <span className="cal-date">{new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                    {(byDay.get(day) ?? []).map((p) => (
                      <Link key={p.id} href={`/posts/${p.id}`} className="post-card" style={{ gap: 4 }}>
                        <ScaledPost brand={brand.profile} spec={p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} />
                        <span className={`status status-${p.status}`} style={{ alignSelf: "flex-start" }}>{p.status}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        {unscheduled.length > 0 && (
          <section className="stack">
            <h2>Not scheduled yet</h2>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))" }}>
              {unscheduled.map((p) => (
                <Link key={p.id} href={`/posts/${p.id}`} className="post-card">
                  <ScaledPost brand={brand.profile} spec={p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
