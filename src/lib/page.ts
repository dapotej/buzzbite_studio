import "server-only";
import { notFound } from "next/navigation";
import { getBrand, listBrands, listPostsByStatus } from "./db";

/** Everything the app shell needs for a brand page. */
export async function loadBrandPage(id: string) {
  const [brand, brands] = await Promise.all([getBrand(id), listBrands()]);
  if (!brand) notFound();
  const toReview = await listPostsByStatus(id, ["review"]);
  return { brand, brands, reviewCount: toReview.length };
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export function todayIso() {
  const n = new Date();
  return iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}
