import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { TopBar } from "@/components/TopBar";
import { TrendRadar } from "@/components/TrendRadar";
import { getBrand, latestTrendReport } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Trends({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await getBrand(id);
  if (!brand) notFound();
  const report = await latestTrendReport(id);
  return (
    <>
      <TopBar />
      <main className="page" style={{ maxWidth: 1000 }}>
        <BrandHeader brand={brand} current="trends" />
        <TrendRadar brandId={brand.id} report={report} />
      </main>
    </>
  );
}
