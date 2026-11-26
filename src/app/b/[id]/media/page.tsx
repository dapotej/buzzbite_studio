import { MediaLibrary } from "@/components/MediaLibrary";
import { Shell } from "@/components/Shell";
import { listMedia } from "@/lib/db";
import { loadBrandPage } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function MediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brand, brands, reviewCount } = await loadBrandPage(id);
  const media = await listMedia(id);
  return (
    <Shell brand={brand} brands={brands} current="media" reviewCount={reviewCount}>
      <MediaLibrary brand={brand} initial={media} />
    </Shell>
  );
}
