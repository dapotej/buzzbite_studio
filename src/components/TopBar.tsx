import Link from "next/link";

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#15171A" />
      <path d="M8 9v14M14 9v14M20 9v14M26 9v14" stroke="#5D625C" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 13c5 0 6 6 11 6s6-6 11-6" fill="none" stroke="#FFB020" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="logo">
          <LogoMark />
          Brandloom
        </Link>
        <nav>
          {children}
          <Link href="/">Brands</Link>
          <a href="/logout">Sign out</a>
        </nav>
      </div>
    </header>
  );
}
