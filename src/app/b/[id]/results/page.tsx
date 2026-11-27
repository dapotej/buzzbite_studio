import Link from "next/link";
import { ScaledPost } from "@/components/PostThumb";
import { FollowerChart, RateBars, SyncResults } from "@/components/Results";
import { Shell } from "@/components/Shell";
import { loadBrandPage } from "@/lib/page";
import { followerSeries, groupBy, postResults, syncState, totals, type PostResult } from "@/lib/results";
import { PLATFORM_NAMES, TEMPLATES, type TemplateId } from "@/lib/types";
import { postingConfigured } from "@/lib/zernio";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;
const dayIso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: number) => (v >= 10_000 ? `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k` : v.toLocaleString("en-GB"));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const day = (d: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

function change(now: number, before: number, days: number): string {
  if (!before) return "";
  const c = (now - before) / before;
  if (Math.abs(c) < 0.005) return `same as the ${days} days before`;
  return `${c > 0 ? "▲" : "▼"} ${Math.abs(c * 100).toFixed(0)}% on the ${days} days before`;
}

/** How the brand's posts did: reach, engagement, followers, and which designs and themes work. */
export default async function ResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  const { id } = await params;
  const { range } = await searchParams;
  const days = RANGES.find((r) => String(r) === range) ?? 30;
  const { brand, brands, reviewCount } = await loadBrandPage(id);
  const today = new Date();
  const from = dayIso(new Date(today.getTime() - (days - 1) * 86400_000));
  const prevFrom = dayIso(new Date(today.getTime() - (2 * days - 1) * 86400_000));
  const prevTo = dayIso(new Date(today.getTime() - days * 86400_000));
  const [state, posts, previous, followers] = await Promise.all([
    syncState(id), postResults(id, from, dayIso(today)), postResults(id, prevFrom, prevTo), followerSeries(id, prevFrom),
  ]);
  const t = totals(posts), p = totals(previous);
  const connected = postingConfigured() && brand.social.accounts.length > 0;
  const ranked = [...posts].filter((x) => x.reach || x.impressions || x.views).sort((a, b) => b.rate - a.rate);
  const designs = groupBy(posts, (x) => TEMPLATES[x.template as TemplateId]?.name ?? x.template);
  const themes = groupBy(posts, (x) => x.pillar);
  const updated = state.synced_at ? new Date(state.synced_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: brand.settings.tz }) : null;

  const tiles: [string, string, string][] = [
    ["Posts published", num(t.posts), change(t.posts, p.posts, days)],
    ["People reached", num(t.reach), change(t.reach, p.reach, days)],
    ["Engagements", num(t.engagements), change(t.engagements, p.engagements, days)],
    ["Engagement rate", pct(t.rate), p.rate ? `${t.rate >= p.rate ? "▲" : "▼"} from ${pct(p.rate)}` : ""],
    ["Link clicks", num(t.clicks), change(t.clicks, p.clicks, days)],
  ];

  const card = (x: PostResult) => (
    <li key={x.id} className="res-post">
      <Link href={`/b/${id}/review?post=${x.id}`} aria-label={`Open ${x.title}`}>
        <ScaledPost brand={brand.profile} spec={x.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} />
      </Link>
      <div>
        <strong>{x.title}</strong>
        <span className="small muted">{day(x.publish_on)} · {TEMPLATES[x.template as TemplateId]?.name ?? x.template}</span>
        <span className="small">{pct(x.rate)} engagement · {num(x.reach || x.impressions || x.views)} reached</span>
      </div>
    </li>
  );

  return (
    <Shell brand={brand} brands={brands} current="results" reviewCount={reviewCount}>
      <div className="wrap stack">
        <div className="head">
          <div>
            <h1 className="title">Results</h1>
            <p className="sub">How {brand.name}&rsquo;s posts did on Instagram and LinkedIn. {updated ? `Updated ${updated}.` : ""}</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <nav className="seg" aria-label="Period">
              {RANGES.map((r) => <Link key={r} href={`?range=${r}`} aria-current={r === days ? "page" : undefined}>{r} days</Link>)}
            </nav>
            {connected && <SyncResults brandId={id} stale={!state.synced_at || Date.now() - new Date(state.synced_at).getTime() > 3600_000} />}
          </div>
        </div>

        {!connected ? (
          <div className="empty"><strong>Connect Instagram or LinkedIn first</strong>Results appear once posts go out through Buzzbite. <Link href={`/b/${id}/kit`}>Connect accounts in the Brand kit</Link>.</div>
        ) : state.access === false ? (
          <p className="plan-note warn" role="status">Results need Zernio&rsquo;s analytics add-on, which isn&rsquo;t on for this account. Turn it on in Zernio (Settings, Billing), then press Refresh.</p>
        ) : state.error ? (
          <p className="plan-note warn" role="status">The last refresh failed: {state.error}</p>
        ) : null}

        {connected && (
          <>
            <ul className="tiles" aria-label={`Last ${days} days`}>
              {tiles.map(([label, value, delta]) => (
                <li key={label} className="tile"><span className="small muted">{label}</span><b>{value}</b><span className="small muted">{delta || " "}</span></li>
              ))}
            </ul>

            {followers.length > 0 && (
              <section className="card stack">
                <h2>Followers</h2>
                <div className="res-follow">
                  {followers.map((s) => <FollowerChart key={s.platform} label={PLATFORM_NAMES[s.platform]} points={s.points.filter((x) => x.day >= from)} />)}
                </div>
              </section>
            )}

            {posts.length === 0 ? (
              <div className="empty"><strong>No numbers yet for these {days} days</strong>Posts show up here a few hours after they go out.</div>
            ) : (
              <>
                <div className="res-grid">
                  <section className="card stack"><h2>Engagement by design</h2><RateBars rows={designs} /></section>
                  <section className="card stack"><h2>Engagement by theme</h2><RateBars rows={themes} /></section>
                </div>

                {ranked.length >= 2 && (
                  <section className="card stack">
                    <h2>Best posts</h2>
                    <ul className="res-posts">{ranked.slice(0, 4).map(card)}</ul>
                    {ranked.length >= 6 && (<><h2 style={{ marginTop: 8 }}>Did least well</h2><ul className="res-posts">{ranked.slice(-3).reverse().map(card)}</ul></>)}
                  </section>
                )}

                <section className="card stack" style={{ overflowX: "auto" }}>
                  <h2>Every post</h2>
                  <table className="res-table">
                    <thead><tr><th scope="col">Date</th><th scope="col">Post</th><th scope="col">Design</th><th scope="col" className="num">Reached</th><th scope="col" className="num">Likes</th><th scope="col" className="num">Comments</th><th scope="col" className="num">Shares</th><th scope="col" className="num">Saves</th><th scope="col" className="num">Clicks</th><th scope="col" className="num">Rate</th><th scope="col">Links</th></tr></thead>
                    <tbody>
                      {posts.map((x) => (
                        <tr key={x.id}>
                          <td>{day(x.publish_on)}</td>
                          <td><Link href={`/b/${id}/review?post=${x.id}`}>{x.title}</Link></td>
                          <td>{TEMPLATES[x.template as TemplateId]?.name ?? x.template}</td>
                          <td className="num">{num(x.reach || x.impressions || x.views)}</td>
                          <td className="num">{num(x.likes)}</td><td className="num">{num(x.comments)}</td><td className="num">{num(x.shares)}</td>
                          <td className="num">{num(x.saves)}</td><td className="num">{num(x.clicks)}</td><td className="num">{pct(x.rate)}</td>
                          <td>{Object.entries(x.urls).map(([pl, u]) => <a key={pl} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{PLATFORM_NAMES[pl as keyof typeof PLATFORM_NAMES]}</a>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <p className="small muted">Engagement rate is likes, comments, shares and saves divided by people reached (or impressions where a platform doesn&rsquo;t report reach). Once there are 8 posts with numbers, new posts are planned with these results in mind: more of what works, less of what doesn&rsquo;t.</p>
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
