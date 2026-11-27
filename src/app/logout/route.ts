import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete("bl_session"); // the old single-password cookie
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
