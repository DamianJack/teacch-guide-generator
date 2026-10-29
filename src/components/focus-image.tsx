"use client";
/* eslint-disable @next/next/no-img-element -- Local photos must not go through an image server. */
import { useEffect, useRef, useState } from "react";
import { drawFocus } from "../lib/focus";
import type { FocusRegion } from "../lib/guide";

export function FocusImage({ src, region, alt, errorLabel }: { src: string; region?: FocusRegion | null; alt: string; errorLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!region) return;
    let active = true;
    const image = new Image(); image.src = src;
    image.decode().then(() => {
      if (!active || !canvas.current) return;
      const context = canvas.current.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      canvas.current.width = image.naturalWidth; canvas.current.height = image.naturalHeight;
      drawFocus(context, image, region); setFailed(false);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [src, region]);
  if (!region) return <img src={src} alt={alt} />;
  return <><canvas ref={canvas} role="img" aria-label={alt} style={failed ? { display: "none" } : undefined} />{failed && <span role="alert">{errorLabel}</span>}</>;
}
