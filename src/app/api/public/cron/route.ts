import { NextResponse } from "next/server";
import { dailyCheck } from "@/lib/system";

export const maxDuration = 300;

/** Vercel runs this once a day (vercel.json). It picks up anything a webhook missed. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  return NextResponse.json(await dailyCheck());
}
