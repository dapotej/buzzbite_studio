import { notFound } from "next/navigation";
import { PostEditor } from "@/components/PostEditor";
import { TopBar } from "@/components/TopBar";
import { getBrand, getPost } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();
  const brand = await getBrand(post.brand_id);
  if (!brand) notFound();
  return (
    <>
      <TopBar />
      <main className="page">
        <PostEditor brand={brand} initial={post} />
      </main>
    </>
  );
}
