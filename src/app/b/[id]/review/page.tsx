import { ReviewPost } from "@/components/ReviewPost";
import { Shell } from "@/components/Shell";
import { getPost, listPostsByStatus } from "@/lib/db";
import { loadBrandPage } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ post?: string }> }) {
  const { id } = await params;
  const { post: postId } = await searchParams;
  const { brand, brands, reviewCount } = await loadBrandPage(id);
  const queue = await listPostsByStatus(id, ["review", "making"]);
  let current = postId ? await getPost(postId) : null;
  if (current && current.brand_id !== id) current = null;
  current = current ?? queue.find((p) => p.status === "review") ?? queue[0] ?? null;
  // The strip shows the posts waiting for review, plus the open post if it's already approved.
  const strip = current && !queue.some((p) => p.id === current!.id) ? [current, ...queue] : queue;
  return (
    <Shell brand={brand} brands={brands} current="review" reviewCount={reviewCount}>
      <ReviewPost brand={brand} post={current} strip={strip} reviewCount={reviewCount} />
    </Shell>
  );
}
