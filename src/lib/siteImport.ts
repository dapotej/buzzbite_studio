import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";

// Reads a business's website so setup can fill in the brand: the words on its key pages,
// the colours its CSS uses most, its fonts and its logo. Only public http(s) addresses
// are fetched (the server never follows a link into a private network), with tight size
// and time limits.

export type SiteImport = {
  url: string;
  pages: { url: string; title: string; text: string }[];
  colors: { hex: string; count: number }[];
  themeColor: string | null;
  fonts: string[];
  logo: { light: string; dark: string | null } | null;
};

export class SiteError extends Error {}

const UA = "Mozilla/5.0 (compatible; BuzzbiteSetup/1.0; +https://buzzbite.io)";
const MAX_HTML = 1_500_000;
const MAX_CSS = 600_000;
const MAX_IMAGE = 3_000_000;

// ---------- safe fetching ----------
function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? privateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u: URL): Promise<void> {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new SiteError("Only web addresses (http or https) can be read.");
  if (u.username || u.password) throw new SiteError("That address can't be read.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new SiteError("That address can't be read.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new SiteError(`Couldn't find ${host}. Check the address.`); });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new SiteError("That address can't be read.");
}

async function safeFetch(url: string, maxBytes: number, accept: string): Promise<{ url: string; type: string; body: Buffer }> {
  let current = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    const res = await fetch(current, { redirect: "manual", headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(9000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current);
      continue;
    }
    if (!res.ok) throw new SiteError(`The site answered with an error (${res.status}).`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) throw new SiteError("That page is too large to read.");
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); break; }
      chunks.push(value);
    }
    return { url: current.toString(), type: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new SiteError("The site redirected too many times.");
}

// ---------- reading pages ----------
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : "";
};

function pageText(html: string): { title: string; text: string } {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim());
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
    .filter((t) => /name\s*=\s*["']?(description|keywords)|property\s*=\s*["']?og:(description|title)/i.test(t)).map((t) => attr(t, "content")).filter(Boolean);
  const body = html
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode([...new Set(meta), body].join("\n"))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 2)
    .filter((l, i, all) => all.indexOf(l) === i) // menus and footers repeat across a page
    .join("\n");
  return { title, text: text.slice(0, 12_000) };
}

const KEY_PAGES = /(about|story|who-we-are|company|services|products|solutions|what-we-do|how-it-works|offer|pricing|features|mission)/i;

function keyLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    if (!KEY_PAGES.test(u.pathname) || /\.(pdf|jpg|png|zip)$/i.test(u.pathname)) continue;
    u.hash = "";
    if (!out.includes(u.toString()) && u.toString() !== base.toString()) out.push(u.toString());
  }
  return out.slice(0, 3);
}

// ---------- colours and fonts ----------
function hexOf(c: string): string | null {
  c = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(c);
  if (m) return "#" + m[1].split("").map((x) => x + x).join("");
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (m) return m[2] && parseInt(m[2], 16) < 128 ? null : "#" + m[1];
  m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(c);
  if (m) {
    if (m[4] && parseFloat(m[4]) < (m[4].endsWith("%") ? 50 : 0.5)) return null;
    return "#" + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("");
  }
  return null;
}

function countColors(css: string, counts: Map<string, number>) {
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
    const hex = hexOf(m[0]);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
}

const GENERIC_FONTS = /^(menlo|monaco|consolas|sf mono|sfmono-regular|liberation mono|lucida console|courier|inherit|initial|unset|serif|sans-serif|monospace|cursive|system-ui|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica neue|helvetica|arial|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|ui-sans-serif|ui-serif|ui-monospace|var\(.*|times new roman|georgia|verdana|tahoma|courier new|emoji|fontawesome.*|font awesome.*|icons?|.*icon.*|swiper-icons|slick)$/i;

function fontsFrom(html: string, css: string): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'\s>]+/gi)) {
    for (const fam of new URL("https://" + m[0].replace(/&amp;/g, "&")).searchParams.getAll("family")) found.push(fam.split(":")[0].replace(/\+/g, " "));
  }
  const tally = new Map<string, number>();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1].split(",")[0].replace(/["']/g, "").replace(/!important/, "").trim();
    if (first && !GENERIC_FONTS.test(first)) tally.set(first, (tally.get(first) ?? 0) + 1);
  }
  found.push(...[...tally].sort((a, b) => b[1] - a[1]).map(([f]) => f));
  return [...new Set(found.map((f) => f.trim()).filter(Boolean))].slice(0, 5);
}

// ---------- logo ----------
type LogoSource = string | { svg: string };

/** An inline <svg> logo: the first one inside a link to the home page, or one labelled as a logo. */
function inlineSvgLogo(html: string, base: URL): string | null {
  const home = new RegExp(`<a\\b[^>]*href\\s*=\\s*["'](?:/|${base.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?)["'][^>]*>([\\s\\S]*?)</a>`, "i").exec(html);
  const inHome = home?.[1] && /<svg\b[\s\S]*?<\/svg>/i.exec(home[1])?.[0];
  const labelled = /<svg\b[^>]*(?:class|id|aria-label)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>[\s\S]*?<\/svg>/i.exec(html)?.[0];
  const svg = inHome || labelled;
  if (!svg || svg.length > 200_000) return null;
  let out = svg.replace(/currentColor/g, "#111111");
  if (!/xmlns=/.test(out)) out = out.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return out;
}

function logoCandidates(html: string, base: URL): LogoSource[] {
  const out: LogoSource[] = [];
  const add = (u: string) => { try { const abs = new URL(u, base).toString(); if (!out.includes(abs)) out.push(abs); } catch { /* skip */ } };
  const header = /<header\b[\s\S]*?<\/header>/i.exec(html)?.[0] ?? "";
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0];
    const hint = `${attr(t, "src")} ${attr(t, "alt")} ${attr(t, "class")} ${attr(t, "id")}`;
    if (/logo/i.test(hint) && attr(t, "src") && !attr(t, "src").startsWith("data:")) add(attr(t, "src"));
  }
  const headerImg = /<img\b[^>]*>/i.exec(header)?.[0];
  if (headerImg && attr(headerImg, "src") && !attr(headerImg, "src").startsWith("data:")) add(attr(headerImg, "src"));
  const svg = inlineSvgLogo(html, base);
  if (svg) out.splice(Math.min(out.length, 1), 0, { svg });
  // Fallbacks: a large or vector site icon, then the touch icon.
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  for (const t of links) if (/rel\s*=\s*["']?[^"'>]*\bicon\b/i.test(t) && (/svg/i.test(attr(t, "type")) || Number(attr(t, "sizes").split("x")[0]) >= 192) && attr(t, "href")) add(attr(t, "href"));
  for (const t of links) if (/rel\s*=\s*["']?[^"'>]*apple-touch-icon/i.test(t) && attr(t, "href")) add(attr(t, "href"));
  return out.slice(0, 6);
}

/** A white copy of a logo with a transparent background, for dark posts. Null when the logo has a solid background. */
async function whiteVersion(png: Buffer): Promise<Buffer | null> {
  const img = sharp(png).ensureAlpha();
  const { width, height } = await img.metadata();
  const alpha = await img.clone().extractChannel(3).raw().toBuffer();
  const transparent = alpha.reduce((n, v) => n + (v < 16 ? 1 : 0), 0);
  if (!width || !height || transparent < alpha.length * 0.1) return null;
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function fetchLogo(candidates: LogoSource[]): Promise<SiteImport["logo"]> {
  for (const c of candidates) {
    try {
      let body: Buffer;
      if (typeof c === "string") {
        const got = await safeFetch(c, MAX_IMAGE, "image/*");
        if (!/image\//.test(got.type) && !/\.(svg|png|jpe?g|webp)(\?|$)/i.test(c)) continue;
        body = got.body;
      } else {
        body = Buffer.from(c.svg);
      }
      const png = await sharp(body, { density: 300 }).resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: false }).png().toBuffer();
      const meta = await sharp(png).metadata();
      if (!meta.width || meta.width < 40) continue;
      const white = await whiteVersion(png);
      return { light: `data:image/png;base64,${png.toString("base64")}`, dark: white ? `data:image/png;base64,${white.toString("base64")}` : null };
    } catch { /* try the next candidate */ }
  }
  return null;
}

// ---------- everything ----------
export async function readWebsite(input: string): Promise<SiteImport> {
  const raw = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) throw new SiteError("Only web addresses (http or https) can be read.");
  let start: URL;
  try { start = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new SiteError("That doesn't look like a web address."); }
  const home = await safeFetch(start.toString(), MAX_HTML, "text/html").catch(async (e) => {
    if (start.protocol === "https:" && !(e instanceof SiteError && /can't be read/.test(e.message))) {
      start.protocol = "http:";
      return safeFetch(start.toString(), MAX_HTML, "text/html");
    }
    throw e;
  });
  const base = new URL(home.url);
  const html = home.body.toString("utf8");
  const pages = [{ url: home.url, ...pageText(html) }];
  const htmls = [html];
  for (const link of keyLinks(html, base)) {
    try {
      const p = await safeFetch(link, MAX_HTML, "text/html");
      if (!/html/i.test(p.type)) continue;
      const h = p.body.toString("utf8");
      htmls.push(h);
      pages.push({ url: p.url, ...pageText(h) });
    } catch { /* skip pages that fail */ }
  }

  // CSS: inline styles, <style> blocks and up to three stylesheets from the home page.
  let css = htmls.map((h) => [...h.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n") + [...h.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";")).join("\n");
  const sheets = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /rel\s*=\s*["']?stylesheet/i.test(t) && !/fonts\.googleapis/i.test(attr(t, "href"))).map((t) => attr(t, "href")).slice(0, 3);
  for (const href of sheets) {
    try { css += "\n" + (await safeFetch(new URL(href, base).toString(), MAX_CSS, "text/css")).body.toString("utf8"); } catch { /* skip */ }
  }
  const counts = new Map<string, number>();
  countColors(css, counts);
  const themeTag = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => /name\s*=\s*["']?theme-color/i.test(t));
  const themeColor = themeTag ? hexOf(attr(themeTag, "content")) : null;

  return {
    url: base.toString(),
    pages,
    colors: [...counts].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count).slice(0, 16),
    themeColor,
    fonts: fontsFrom(htmls.join("\n"), css),
    logo: await fetchLogo(logoCandidates(html, base)),
  };
}

/** The website's words and design signals, written for Claude. */
export function describeSite(s: SiteImport): string {
  const pages = s.pages.map((p) => `--- ${p.title || p.url} (${p.url})\n${p.text}`).join("\n\n").slice(0, 30_000);
  return [
    `Website: ${s.url}`,
    "Design signals found in the website's code (use them for colours and fonts):",
    `- Colours by how often the CSS uses them: ${s.colors.map((c) => `${c.hex} (${c.count})`).join(", ") || "none found"}`,
    `- Theme colour: ${s.themeColor ?? "none"}`,
    `- Fonts: ${s.fonts.join(", ") || "none found"}`,
    "",
    "Text from the website:",
    pages,
  ].join("\n");
}
