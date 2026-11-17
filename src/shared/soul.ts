/**
 * The numbers from `docs/soul/thresholds.json` that the frame itself needs
 * (safe zones, caption geometry, audio fades). Read from the same file the
 * linter reads, so a channel that changes a threshold changes the picture too.
 */
import thresholds from "../../docs/soul/thresholds.json";

type Entry = {value: unknown};
const raw = thresholds as unknown as Record<string, Entry>;

const value = <T>(key: string, fallback: T): T => {
  const entry = raw[key];
  return entry && entry.value !== undefined ? (entry.value as T) : fallback;
};

export type TallCardLayoutConfig = {
  canvas: [number, number];
  ambientBlurPx: number;
  ambientBrightness: number;
  ambientSaturate: number;
  patternOpacity: number;
  topSafePadPx: number;
  headerTopPx: number;
  headerHeightPx: number;
  cardGapPx: [number, number];
  cardDefaultGapPx: number;
  cardWidthPx: number;
  cardHeightPx: [number, number];
  cardDefaultTopPx: number;
  cardDefaultHeightPx: number;
  objectPosition: string;
  kenBurnsScale: [number, number];
  infoTopPx: number;
  infoHeightPx: number;
  infoToSubtitleGapPx: [number, number];
  infoToSubtitleDefaultGapPx: number;
  subtitleBandYPx: [number, number];
  bottomSafeMinPx: [number, number];
  subtitleDefaultBottomPx: number;
};

const DEFAULT_TALL_CARD_LAYOUT: TallCardLayoutConfig = {
  canvas: [1080, 1920],
  ambientBlurPx: 50,
  ambientBrightness: 0.25,
  ambientSaturate: 1.3,
  patternOpacity: 0.06,
  topSafePadPx: 280,
  headerTopPx: 280,
  headerHeightPx: 130,
  cardGapPx: [16, 20],
  cardDefaultGapPx: 18,
  cardWidthPx: 774,
  cardHeightPx: [920, 960],
  cardDefaultTopPx: 428,
  cardDefaultHeightPx: 950,
  objectPosition: "center 20%",
  kenBurnsScale: [1, 1.1],
  infoTopPx: 1396,
  infoHeightPx: 120,
  infoToSubtitleGapPx: [70, 90],
  infoToSubtitleDefaultGapPx: 74,
  subtitleBandYPx: [1590, 1660],
  bottomSafeMinPx: [260, 300],
  subtitleDefaultBottomPx: 260,
};

export const SOUL = {
  safeTopPx: value("safeTopPx", 212),
  safeBottomPx: value("safeBottomPx", 1726),
  safeRightPx: value<{x: number; fromY: number}>("safeRightPx", {x: 927, fromY: 803}),
  panelMaxWidthPx: value("panelMaxWidthPx", 774),
  captionWordsPerChunk: value<[number, number]>("captionWordsPerChunk", [2, 4]),
  captionBottomShare: value("captionBottomShare", 0.24),
  captionSecondLangMaxLines: value("captionSecondLangMaxLines", 2),
  musicFadeOutSeconds: value("musicFadeOutSeconds", 9),
  outroHoldSeconds: value<[number, number]>("outroHoldSeconds", [3, 4]),
  coverCropRatio: value("coverCropRatio", 1.29),
  tallCardLayout: value<TallCardLayoutConfig>("tallCardLayout", DEFAULT_TALL_CARD_LAYOUT),
} as const;
