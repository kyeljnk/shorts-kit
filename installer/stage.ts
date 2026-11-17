import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";

const REPO = resolve(import.meta.dir, "..");
const STAGE = join(REPO, ".build-installer", "stage");
const DIST = join(REPO, "dist-installer");

console.log("1. Cleaning staging directory...");
if (existsSync(STAGE)) rmSync(STAGE, {recursive: true, force: true});
mkdirSync(STAGE, {recursive: true});
mkdirSync(DIST, {recursive: true});

const runtimeDir = join(STAGE, "runtime");
const studioDir = join(STAGE, "studio");
const tplDir = join(STAGE, "template");
mkdirSync(runtimeDir, {recursive: true});
mkdirSync(join(studioDir, "assets"), {recursive: true});
mkdirSync(tplDir, {recursive: true});

console.log("2. Copying ShortsKit.exe & icon...");
const exeSrc = join(REPO, "desktop", "launcher", "target", "release", "ShortsKit.exe");
if (!existsSync(exeSrc)) throw new Error("Missing ShortsKit.exe. Run cargo build --release first.");
cpSync(exeSrc, join(STAGE, "ShortsKit.exe"));
cpSync(join(REPO, "desktop", "launcher", "app.ico"), join(STAGE, "app.ico"));

console.log("3. Copying runtime binaries (bun, ffmpeg, ffprobe)...");
cpSync(process.execPath, join(runtimeDir, "bun.exe"));

const findRealFfmpegDir = () => {
  const localPkg = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (existsSync(localPkg)) {
    for (const d of readdirSync(localPkg)) {
      if (d.startsWith("Gyan.FFmpeg")) {
        const sub = join(localPkg, d);
        for (const inner of readdirSync(sub)) {
          const bin = join(sub, inner, "bin");
          if (existsSync(join(bin, "ffmpeg.exe"))) return bin;
        }
      }
    }
  }
  const ff = Bun.which("ffmpeg");
  if (ff) return resolve(ff, "..");
  throw new Error("Could not locate real ffmpeg.exe");
};
const ffDir = findRealFfmpegDir();
cpSync(join(ffDir, "ffmpeg.exe"), join(runtimeDir, "ffmpeg.exe"));
cpSync(join(ffDir, "ffprobe.exe"), join(runtimeDir, "ffprobe.exe"));

console.log("4. Copying Studio server, prebuilt UI & tutorial video...");
cpSync(join(REPO, "desktop", "studio-server.ts"), join(studioDir, "studio-server.ts"));
cpSync(join(REPO, "desktop", "dist-ui"), join(studioDir, "dist-ui"), {recursive: true});
const tutMp4 = join(REPO, "out", "huong-dan-shorts-kit", "huong-dan-shorts-kit-upload.mp4");
if (existsSync(tutMp4)) {
  cpSync(tutMp4, join(studioDir, "assets", "tutorial.mp4"));
}

console.log("5. Staging clean department template...");
const copyRootFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "SOUL.md",
  "README.md",
  "LICENSE",
  "package.json",
  "tsconfig.json",
  "remotion.config.ts",
  ".env.example",
  ".gitignore",
];
for (const f of copyRootFiles) {
  if (existsSync(join(REPO, f))) cpSync(join(REPO, f), join(tplDir, f));
}

const copyDirs = [
  ".claude",
  ".agents",
  "scripts",
  "src/shared",
  "src/videos/_template",
  "src/videos/example",
  "src/videos/gallery",
  "src/videos/huong-dan-shorts-kit",
  "public/sfx",
  "public/fonts",
  "docs/assets",
  "docs/flows",
  "docs/lessons",
  "docs/soul",
  "docs/visuals",
];
for (const d of copyDirs) {
  if (existsSync(join(REPO, d))) cpSync(join(REPO, d), join(tplDir, d), {recursive: true});
}

// Root docs files
for (const ent of readdirSync(join(REPO, "docs"), {withFileTypes: true})) {
  if (ent.isFile()) cpSync(join(REPO, "docs", ent.name), join(tplDir, "docs", ent.name));
}

// Clean briefs (only _template, example, huong-dan-shorts-kit)
mkdirSync(join(tplDir, "briefs"), {recursive: true});
for (const bf of ["_template.md", "example.md", "huong-dan-shorts-kit.md"]) {
  if (existsSync(join(REPO, "briefs", bf))) cpSync(join(REPO, "briefs", bf), join(tplDir, "briefs", bf));
}

// Clean public/music (README + mat-qr-original.wav used by tutorial)
mkdirSync(join(tplDir, "public", "music"), {recursive: true});
for (const mf of ["README.md", "mat-qr-original.wav"]) {
  if (existsSync(join(REPO, "public", "music", mf))) cpSync(join(REPO, "public", "music", mf), join(tplDir, "public", "music", mf));
}

// Clean public/audio (only example & huong-dan-shorts-kit if present)
for (const af of ["example", "huong-dan-shorts-kit"]) {
  if (existsSync(join(REPO, "public", "audio", af))) {
    cpSync(join(REPO, "public", "audio", af), join(tplDir, "public", "audio", af), {recursive: true});
  }
}

// Pre-rendered out/huong-dan-shorts-kit so user immediately sees a finished 12/12 example
if (existsSync(join(REPO, "out", "huong-dan-shorts-kit"))) {
  cpSync(join(REPO, "out", "huong-dan-shorts-kit"), join(tplDir, "out", "huong-dan-shorts-kit"), {recursive: true});
}

// Clean docs/facts (keep only example + huong-dan-shorts-kit + s-0045 music)
mkdirSync(join(tplDir, "docs", "facts"), {recursive: true});
cpSync(join(REPO, "docs", "facts", "README.md"), join(tplDir, "docs", "facts", "README.md"));
const allFacts = JSON.parse(readFileSync(join(REPO, "docs", "facts", "facts.json"), "utf8"));
const allSources = JSON.parse(readFileSync(join(REPO, "docs", "facts", "sources.json"), "utf8"));
const keepFacts = allFacts.filter((f: any) => {
  const n = Number(String(f.id).replace("f-", ""));
  return (n >= 1 && n <= 10) || (n >= 65 && n <= 70);
});
const keepSourceIds = new Set<string>(["s-0045", "s-0148", "s-0149", "s-0150"]);
for (const f of keepFacts) for (const sid of f.sources ?? []) keepSourceIds.add(sid);
const keepSources = allSources.filter((s: any) => keepSourceIds.has(s.id));
writeFileSync(join(tplDir, "docs", "facts", "facts.json"), JSON.stringify(keepFacts, null, 2) + "\n");
writeFileSync(join(tplDir, "docs", "facts", "sources.json"), JSON.stringify(keepSources, null, 2) + "\n");

console.log("6. Copying node_modules (excluding .cache)...");
const nmSrc = join(REPO, "node_modules");
const nmDst = join(tplDir, "node_modules");
mkdirSync(nmDst, {recursive: true});
for (const ent of readdirSync(nmSrc, {withFileTypes: true})) {
  if (ent.name === ".cache") continue;
  cpSync(join(nmSrc, ent.name), join(nmDst, ent.name), {recursive: true});
}

console.log("✅ Staging complete at", STAGE);
