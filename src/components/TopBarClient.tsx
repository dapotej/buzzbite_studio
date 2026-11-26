import Link from "next/link";
import { LogoMark } from "./TopBar";

/** Same bar as TopBar, safe to import from client components. */
export function TopBarClient() {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="logo"><LogoMark />Brandloom</Link>
        <nav>
          <Link href="/">Brands</Link>
          <a href="/logout">Sign out</a>
        </nav>
      </div>
    </header>
  );
}
