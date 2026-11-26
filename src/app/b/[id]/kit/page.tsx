import { BrandKit } from "@/components/BrandKit";
import { Shell } from "@/components/Shell";
import { loadBrandPage } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brand, brands, reviewCount } = await loadBrandPage(id);
  return (
    <Shell brand={brand} brands={brands} current="kit" reviewCount={reviewCount}>
      <BrandKit brand={brand} />
    </Shell>
  );
}
