"use client";
import { useEffect, useRef, useState } from "react";
import { POST_W, PostCanvas } from "@/templates/PostCanvas";
import { ensureFonts } from "@/lib/export";
import { isVideoPost, type BrandProfile, type PostSpec } from "@/lib/types";

/** A post rendered at full size and scaled to fit its container's width. */
export function ScaledPost(props: {
  brand: BrandProfile;
  spec: PostSpec;
  logoOnLight: string | null;
  logoOnDark: string | null;
  animate?: boolean;
  canvasRef?: React.Ref<HTMLDivElement>;
  replayKey?: number;
  badge?: boolean;
  slide?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => { ensureFonts([props.brand.fonts.display, props.brand.fonts.body]); }, [props.brand.fonts.display, props.brand.fonts.body]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / POST_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="thumb" ref={box} style={{ aspectRatio: "4 / 5" }}>
      {props.badge !== false && isVideoPost(props.spec) && <span className="vbadge">{props.spec.template === "reel" ? "Reel" : "Video"}</span>}
      {props.badge !== false && props.spec.template === "carousel" && <span className="vbadge vbadge-slides">{props.spec.slides.length || 1} slides</span>}
      <div className="scaler" style={{ transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }} ref={props.canvasRef} key={props.replayKey}>
        <PostCanvas brand={props.brand} spec={props.spec} logoOnLight={props.logoOnLight} logoOnDark={props.logoOnDark} animate={props.animate} slide={props.slide} />
      </div>
    </div>
  );
}
