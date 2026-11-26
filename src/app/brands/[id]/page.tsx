import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { IdeasPanel } from "@/components/IdeasPanel";
import { PostGrid } from "@/components/PostGrid";
import { TopBar } from "@/components/TopBar";
import { getBrand, listIdeas, listPosts } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BrandStudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await getBrand(id);
  if (!brand) notFound();
  const [ideas, posts] = await Promise.all([listIdeas(id), listPosts(id)]);
  return (
    <>
      <TopBar />
      <main className="page">
        <BrandHeader brand={brand} current="studio" />
        <div className="cols">
          <IdeasPanel brandId={brand.id} ideas={ideas} hasPillars={brand.profile.pillars.length > 0} />
          <section className="stack" aria-labelledby="posts-h">
            <h2 id="posts-h">Posts</h2>
            <PostGrid brand={brand} posts={posts} />
          </section>
        </div>
      </main>
    </>
  );
}
