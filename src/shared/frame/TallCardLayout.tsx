import React from "react";
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {clamp} from "../motion/anim";
import {SOUL} from "../soul";
import {W} from "../theme";
import {AmbientBackdrop} from "./AmbientBackdrop";

const cfg = SOUL.tallCardLayout;

/**
 * Pixel-exact vertical geometry for the Tall 4:5 Visual Card + Ambient Blur layout (1080×1920):
 * - 0..280:    top safe buffer (clears status bar + TikTok Explore/Following/For You + search icon & Reels top UI)
 * - 280..410:  top title box (130 px, optional; when omitted the card expands into 280..1378)
 * - 428..1378: 4:5 portrait card (774×950 px default inside x = 153..927, clear of right action buttons)
 * - 1396..1516: lower info box (120 px, inside x = 153..927)
 * - 1590..1660: subtitle band (70..90 px below info box, 74 px default)
 * - 1660..1920: bottom safe zone for TikTok channel name & caption (260..300 px)
 */
export const TALL_CARD_LAYOUT = {
  width: cfg.cardWidthPx,
  left: Math.round((W - cfg.cardWidthPx) / 2),
  topSafePad: cfg.topSafePadPx,
  headerTop: cfg.headerTopPx,
  headerHeight: cfg.headerHeightPx,
  gap: cfg.cardDefaultGapPx,
  cardTop: cfg.cardDefaultTopPx,
  cardHeight: cfg.cardDefaultHeightPx,
  infoTop: cfg.infoTopPx,
  infoHeight: cfg.infoHeightPx,
  infoToSubtitleGap: cfg.infoToSubtitleDefaultGapPx,
  subtitleTop: cfg.subtitleBandYPx[0],
  subtitleBottom: cfg.subtitleDefaultBottomPx,
  objectPosition: cfg.objectPosition,
} as const;

export type TallCardMove = "zoom-in" | "zoom-out" | "pan-left" | "pan-right";

export const tallCardKenBurns = (progress: number, move: TallCardMove = "zoom-in"): string => {
  const [minS, maxS] = cfg.kenBurnsScale;
  const p = clampProgress(progress);
  if (move === "zoom-out") {
    const s = interpolate(p, [0, 1], [maxS, minS], clamp);
    return `scale(${s})`;
  }
  if (move === "pan-left") {
    const tx = interpolate(p, [0, 1], [24, -24], clamp);
    return `scale(${maxS}) translateX(${tx}px)`;
  }
  if (move === "pan-right") {
    const tx = interpolate(p, [0, 1], [-24, 24], clamp);
    return `scale(${maxS}) translateX(${tx}px)`;
  }
  const s = interpolate(p, [0, 1], [minS, maxS], clamp);
  return `scale(${s})`;
};

const clampProgress = (v: number) => Math.max(0, Math.min(1, v));
const resolveSrc = (src: string) => (/^(https?:|data:|\/)/.test(src) ? src : staticFile(src));

/**
 * Reusable Tall 4:5 Portrait Card + Ambient Blurred Background shell.
 * Keeps the optional header, 774×950 portrait image card, and lower info box compactly
 * stacked inside the safe zone (x = 153..927, y >= 280) and 70–90 px above subtitles.
 */
export const TallCardLayout: React.FC<{
  /** Scene image used both inside the 4:5 card and as the AmbientBackdrop source. */
  src: string;
  /** Optional custom progress [0..1] for multi-shot scenes; defaults to sequence progress. */
  progress?: number;
  move?: TallCardMove;
  objectPosition?: string;
  cardHeight?: number;
  gap?: number;
  borderColor?: string;
  patternVariant?: "grid" | "dots";
  header?: React.ReactNode;
  info?: React.ReactNode;
  cardOverlay?: React.ReactNode;
  children?: React.ReactNode;
}> = ({
  src,
  progress,
  move = "zoom-in",
  objectPosition = TALL_CARD_LAYOUT.objectPosition,
  cardHeight,
  gap = TALL_CARD_LAYOUT.gap,
  borderColor = "rgba(255,255,255,0.22)",
  patternVariant = "grid",
  header,
  info,
  cardOverlay,
  children,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = progress ?? interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], clamp);
  const clampedGap = Math.max(cfg.cardGapPx[0], Math.min(cfg.cardGapPx[1], gap));
  const headerTop = TALL_CARD_LAYOUT.headerTop;
  const headerSpan = header ? TALL_CARD_LAYOUT.headerHeight + clampedGap : 0;
  const maxCardH = header ? cfg.cardHeightPx[1] : cfg.cardHeightPx[1] + TALL_CARD_LAYOUT.headerHeight + clampedGap;
  const rawCardH = cardHeight ?? (header ? TALL_CARD_LAYOUT.cardHeight : TALL_CARD_LAYOUT.cardHeight + TALL_CARD_LAYOUT.headerHeight + clampedGap);
  const clampedCardH = Math.max(cfg.cardHeightPx[0], Math.min(maxCardH, rawCardH));
  const cardTop = headerTop + headerSpan;
  const infoTop = cardTop + clampedCardH + clampedGap;

  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      <AmbientBackdrop src={src} progress={p} patternVariant={patternVariant} objectPosition={objectPosition} />

      {header ? (
        <div
          style={{
            position: "absolute",
            left: TALL_CARD_LAYOUT.left,
            top: headerTop,
            width: TALL_CARD_LAYOUT.width,
            height: TALL_CARD_LAYOUT.headerHeight,
            boxSizing: "border-box",
            zIndex: 2,
          }}
        >
          {header}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: TALL_CARD_LAYOUT.left,
          top: cardTop,
          width: TALL_CARD_LAYOUT.width,
          height: clampedCardH,
          borderRadius: 22,
          overflow: "hidden",
          border: `2.5px solid ${borderColor}`,
          boxShadow: "0 20px 48px rgba(0,0,0,0.72)",
          backgroundColor: "#080d0b",
          zIndex: 2,
        }}
      >
        {children ?? (
          <Img
            src={resolveSrc(src)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition,
              transform: tallCardKenBurns(p, move),
            }}
          />
        )}
        {cardOverlay}
      </div>

      {info ? (
        <div
          style={{
            position: "absolute",
            left: TALL_CARD_LAYOUT.left,
            top: infoTop,
            width: TALL_CARD_LAYOUT.width,
            height: TALL_CARD_LAYOUT.infoHeight,
            boxSizing: "border-box",
            zIndex: 2,
          }}
        >
          {info}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
