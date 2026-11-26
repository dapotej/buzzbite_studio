import { Shell } from "@/components/Shell";
import { TrendRadar } from "@/components/TrendRadar";
import { latestTrendReport } from "@/lib/db";
import { loadBrandPage } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function TrendsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brand, brands, reviewCount } = await loadBrandPage(id);
  const report = await latestTrendReport(id);
  return (
    <Shell brand={brand} brands={brands} current="trends" reviewCount={reviewCount}>
      <TrendRadar brand={brand} report={report} />
    </Shell>
  );
}
