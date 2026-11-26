import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { SESSION_COOKIE, createSessionValue, passwordMatches } from "@/lib/auth";

async function signIn(formData: FormData) {
  "use server";
  const ok = await passwordMatches(String(formData.get("password") ?? ""));
  if (!ok) redirect("/login?error=1");
  const { value, maxAge } = await createSessionValue();
  (await cookies()).set(SESSION_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/" });
  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: 420, paddingTop: "12vh", paddingInline: 16 }}>
      <div className="row" style={{ gap: 12 }}>
        <span style={{ width: 34, height: 34, display: "inline-flex" }}><LogoMark /></span>
        <h1>SocialPilot</h1>
      </div>
      <p className="lede">Your social media on autopilot, in your brand.</p>
      <form action={signIn} className="card stack">
        <label className="field" htmlFor="password">
          Password
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        </label>
        {error && <p className="error" role="alert">That password is not right. Try again.</p>}
        <button className="btn btn-ink" type="submit">Sign in</button>
      </form>
    </main>
  );
}
