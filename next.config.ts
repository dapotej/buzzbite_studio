import type { NextConfig } from "next";

// Sent with every response. No full Content-Security-Policy yet: posts load photos, fonts and
// video from several hosts, so only framing is locked down for now.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Brand logos are stored as data URLs; allow request bodies big enough for them.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Calendar thumbnails load resized copies of photos stored in Vercel Blob.
  images: { remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }], formats: ["image/webp"] },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Reset links carry a token in the address: never send it on to other sites.
      { source: "/reset", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
