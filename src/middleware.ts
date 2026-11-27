import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

// Earlier addresses of the app. Visitors are sent to the same page on the current one.
const OLD_HOSTS = new Set(["getsocialpilot.vercel.app", "brandloom-six.vercel.app"]);
const HOME = "app.buzzbite.io";

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  if (OLD_HOSTS.has(host)) {
    const url = req.nextUrl.clone();
    url.host = HOME;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  if (req.nextUrl.pathname === "/login") return NextResponse.next();
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)"],
};
