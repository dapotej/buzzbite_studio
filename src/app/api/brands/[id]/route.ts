import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteBrand, updateBrand } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { BrandProfileSchema } from "@/lib/types";

const DataUrl = z.string().max(1_500_000).regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,/).nullable();
const Body = z.object({ profile: BrandProfileSchema.optional(), logo_on_light: DataUrl.optional(), logo_on_dark: DataUrl.optional() });

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await updateBrand(id, Body.parse(await req.json()));
  return brand ? NextResponse.json({ ok: true }) : notFound();
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await deleteBrand(id);
  return NextResponse.json({ ok: true });
});
