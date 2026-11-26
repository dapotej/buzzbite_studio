"use client";
import Link from "next/link";
import { ScaledPost } from "./PostThumb";
import { isVideoPost, type Brand, type Post } from "@/lib/types";

export function fmtDay(d: string | null) {
  if (!d) return "Not scheduled";
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function PostGrid({ brand, posts }: { brand: Brand; posts: Post[] }) {
  if (!posts.length) {
    return (
      <div className="empty">
        <strong>No posts yet</strong>
        Pick an idea on the left and choose Create post. Brandloom writes the captions and designs the visual in your brand.
      </div>
    );
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))" }}>
      {posts.map((p) => (
        <Link key={p.id} href={`/posts/${p.id}`} className="post-card">
          <ScaledPost brand={brand.profile} spec={p.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} animate={false} />
          <div className="row" style={{ gap: 6 }}>
            <span className={`status status-${p.status}`}>{p.status[0].toUpperCase() + p.status.slice(1)}</span>
            {isVideoPost(p.spec) && <span className="chip chip-video">Video</span>}
            <span className="spacer" />
            <span className="small muted">{fmtDay(p.publish_on)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
