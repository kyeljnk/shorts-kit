import React from "react";
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {Vignette} from "../fx/Vignette";
import {clamp} from "../motion/anim";
import {SOUL} from "../soul";

const resolveSrc = (src: string) => (/^(https?:|data:|\/)/.test(src) ? src : staticFile(src));

/**
 * Full-bleed 1080×1920 ambient blurred backdrop derived from the active scene image (§5, §12).
 * Replaces flat dark gradients with a soft-motion blurred duplicate of the scene asset,
 * an edge vignette, and a subtle 6% grid/dot texture so foreground card borders read crisply.
 */
export const AmbientBackdrop: React.FC<{
  /** Image path under public/ (passed to staticFile) or absolute/URL string. */
  src: string;
  /** Optional normalized progress [0..1] for gentle background breathing; defaults to scene progress. */
  progress?: number;
  blurPx?: number;
  brightness?: number;
  saturate?: number;
  vignetteStrength?: number;
  patternOpacity?: number;
  patternVariant?: "grid" | "dots";
  objectPosition?: string;
}> = ({
  src,
  progress,
  blurPx = SOUL.tallCardLayout.ambientBlurPx,
  brightness = SOUL.tallCardLayout.ambientBrightness,
  saturate = SOUL.tallCardLayout.ambientSaturate,
  vignetteStrength = 0.55,
  patternOpacity = SOUL.tallCardLayout.patternOpacity,
  patternVariant = "grid",
  objectPosition = SOUL.tallCardLayout.objectPosition,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = progress ?? interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], clamp);
  const scale = interpolate(p, [0, 1], [1.14, 1.2], clamp);
  const tx = interpolate(p, [0, 1], [-10, 10], clamp);

  const patternStyle: React.CSSProperties =
    patternVariant === "dots"
      ? {
          backgroundImage: "radial-gradient(rgba(255,255,255,0.85) 1.25px, transparent 1.25px)",
          backgroundSize: "24px 24px",
        }
      : {
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.75) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.75) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        };

  return (
    <AbsoluteFill style={{zIndex: 0, overflow: "hidden", backgroundColor: "#050807", pointerEvents: "none"}}>
      <Img
        src={resolveSrc(src)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          filter: `blur(${blurPx}px) brightness(${brightness}) saturate(${saturate})`,
          transform: `scale(${scale}) translateX(${tx}px)`,
        }}
      />
      <Vignette strength={vignetteStrength} />
      {patternOpacity > 0 ? <AbsoluteFill style={{...patternStyle, opacity: patternOpacity}} /> : null}
    </AbsoluteFill>
  );
};
