import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, setBrandSocial } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { disconnectAccount, listAccounts, postingConfigured } from "@/lib/zernio";

/** The brand's connected accounts, refreshed from the posting service. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  if (!postingConfigured()) return NextResponse.json({ configured: false, accounts: brand.social.accounts });
  if (!brand.social.profileId) return NextResponse.json({ configured: true, accounts: [] });
  const accounts = await listAccounts(brand.social.profileId);
  await setBrandSocial(id, { ...brand.social, accounts });
  return NextResponse.json({ configured: true, accounts });
});

const Del = z.object({ account: z.string().min(1).max(64) });

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { account } = Del.parse(Object.fromEntries(new URL(req.url).searchParams));
  const brand = await getBrand(id);
  if (!brand) return notFound();
  if (!brand.social.accounts.some((a) => a.id === account)) return notFound();
  await disconnectAccount(account);
  const accounts = brand.social.accounts.filter((a) => a.id !== account);
  await setBrandSocial(id, { ...brand.social, accounts });
  return NextResponse.json({ configured: true, accounts });
});
