import { NextResponse } from "next/server";
import { z } from "zod";
import { insertLead } from "@/lib/db";

// Sign-ups from the Buzzbite website. Public: no session needed (see middleware).
const ORIGINS = new Set(["https://buzzbite.io", "https://www.buzzbite.io"]);
const allowed = (o: string | null) => !!o && (ORIGINS.has(o) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o));
const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": allowed(o) ? o! : "https://buzzbite.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  Vary: "Origin",
});

const s = (max: number) => z.string().trim().max(max).default("");
const Body = z.object({
  kind: z.enum(["waitlist", "campaign", "creator"]),
  email: z.email().max(200),
  name: s(120), company: s(160), handle: s(120), message: s(3000), source: s(200),
  website: z.string().max(200).optional(), // honeypot: people never fill it in
});

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check your email address and try again." }, { status: 400, headers });
  const { website, ...lead } = parsed.data;
  if (website) return NextResponse.json({ ok: true }, { headers }); // a bot: pretend it worked
  try {
    await insertLead(lead);
  } catch (e) {
    console.error("lead insert failed", e);
    return NextResponse.json({ error: "Something went wrong. Try again in a moment." }, { status: 500, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
