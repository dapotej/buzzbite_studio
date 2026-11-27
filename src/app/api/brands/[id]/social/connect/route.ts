import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, setBrandSocial } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { PLATFORMS } from "@/lib/types";
import { connectUrl, ensureProfile } from "@/lib/zernio";

const Body = z.object({ platform: z.enum(PLATFORMS) });

/** Returns the platform's login link; after logging in, the person comes back to the brand kit. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { platform } = Body.parse(await req.json());
  const brand = await getBrand(id);
  if (!brand) return notFound();
  let profileId = brand.social.profileId;
  if (!profileId) {
    profileId = await ensureProfile({ id: brand.id, name: brand.name, tz: brand.settings.tz });
    await setBrandSocial(id, { ...brand.social, profileId });
  }
  const back = new URL(`/b/${id}/kit?connected=${platform}#accounts`, req.url).toString();
  return NextResponse.json({ url: await connectUrl(profileId, platform, back) });
});
