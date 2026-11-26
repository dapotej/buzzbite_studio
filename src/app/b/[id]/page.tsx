import { Calendar } from "@/components/Calendar";
import { Shell } from "@/components/Shell";
import { listPostsBetween } from "@/lib/db";
import { iso, loadBrandPage, todayIso } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string; view?: string }> }) {
  const { id } = await params;
  const { m, view } = await searchParams;
  const { brand, brands, reviewCount } = await loadBrandPage(id);
  const today = todayIso();
  // Default to the month that still has most of its days ahead: from the 20th on, show next month.
  const t = new Date(today + "T00:00:00Z");
  const defMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + (t.getUTCDate() >= 20 ? 1 : 0), 1));
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? new Date(m + "-01T00:00:00Z") : defMonth;
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const gridStart = new Date(first); gridStart.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const gridEnd = new Date(last); gridEnd.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));
  const posts = await listPostsBetween(id, iso(gridStart), iso(gridEnd));
  return (
    <Shell brand={brand} brands={brands} current="calendar" reviewCount={reviewCount}>
      <Calendar
        brand={brand} posts={posts} today={today} view={view === "week" ? "week" : "month"}
        monthStart={iso(first)} monthEnd={iso(last)} gridStart={iso(gridStart)} gridEnd={iso(gridEnd)}
      />
    </Shell>
  );
}
