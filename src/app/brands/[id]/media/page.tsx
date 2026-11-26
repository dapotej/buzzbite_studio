import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { MediaLibrary } from "@/components/MediaLibrary";
import { TopBar } from "@/components/TopBar";
import { getBrand, listMedia } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await getBrand(id);
  if (!brand) notFound();
  const media = await listMedia(id);
  return (
    <>
      <TopBar />
      <main className="page">
        <BrandHeader brand={brand} current="media" />
        <MediaLibrary brandId={brand.id} initial={media} />
      </main>
    </>
  );
}
