import {parseArgs} from "node:util";
import {access, mkdir, readFile, rename, stat, unlink} from "node:fs/promises";
import {basename, extname, join, relative, resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {ID_RE, outDir, p} from "./lib/paths";
import {digest, GeminiVideoApi, MODEL, writeAtomic, type GeminiInput, type GeminiResult} from "./lib/gemini-video";

const EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".mpeg", ".mpg"]);
const DEFAULT_BATCH_SIZE = 8;
const PROXY_REVISION = 1;

const USAGE = `bun run gemini-video check
bun run gemini-video analyze <id> <source-folder> --prompt <file.md> [options]

  --reference <video>       Reference video. Repeat to add a second reference.
  --batch-size <1..8>        Source videos per request (default 8).
  --rotate <prefix=clock>    Rotate sideways source files with this filename prefix.
                             Also accepts cclock. Repeat for other prefixes.
  --dry-run                 List the inputs and requests without uploading or calling Google.

Requires FFmpeg, a paid Gemini API project and GEMINI_API_KEY in .env.
Analysis uses gemini-4-argon with Agentic Video Understanding and incurs API usage.`;

type Asset = {path: string; name: string; key: string; rotation?: "clock" | "cclock"; size: number};
type Job = {label: string; assets: Asset[]; instruction: string};

async function mediaIn(dir: string): Promise<string[]> {
  if (!(await stat(dir)).isDirectory()) throw new Error("Expected a source folder: " + dir);
  const found: string[] = [];
  for await (const path of new Bun.Glob("**/*").scan({cwd: dir, onlyFiles: true})) {
    if (EXTENSIONS.has(extname(path).toLowerCase())) found.push(join(dir, path));
  }
  return found.sort((a, b) => a.localeCompare(b, "en", {numeric: true}));
}

async function asset(path: string, name: string, rotation?: Asset["rotation"]): Promise<Asset> {
  const meta = await stat(path);
  if (!meta.isFile() || !meta.size || !EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new Error("Expected a non-empty supported video file: " + path);
  }
  return {path, name, rotation, size: meta.size, key: digest([PROXY_REVISION, path, meta.size, meta.mtimeMs, rotation])};
}

async function proxy(asset: Asset, cache: string): Promise<string> {
  const dir = join(cache, "proxies");
  const target = join(dir, asset.key + ".mp4");
  if (await access(target).then(() => true, () => false)) return target;
  await mkdir(dir, {recursive: true});
  const temp = join(dir, asset.key + "." + randomUUID() + ".mp4");
  const filters = "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p";
  const vf = asset.rotation ? filters + ",transpose=" + asset.rotation : filters;
  try {
    const ffmpeg = Bun.spawn([
      "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
      "-threads", "2", "-i", asset.path, "-map", "0:v:0", "-map", "0:a:0?",
      "-filter_threads", "1", "-vf", vf, "-fpsmax", "30",
      "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "24",
      "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", temp,
    ], {stdout: "ignore", stderr: "pipe"});
    const detail = await new Response(ffmpeg.stderr).text();
    if (await ffmpeg.exited) throw new Error("FFmpeg failed for " + asset.name + ": " + detail.trim());
    await rename(temp, target);
    return target;
  } finally {
    await unlink(temp).catch(() => {});
  }
}

const textPart = (text: string): GeminiInput => ({type: "text", text});

async function prepareInput(job: Job, api: GeminiVideoApi, cache: string): Promise<GeminiInput[]> {
  const input: GeminiInput[] = [textPart(job.instruction)];
  for (let offset = 0; offset < job.assets.length; offset += 3) {
    const group = job.assets.slice(offset, offset + 3);
    const videos = await Promise.allSettled(group.map(async (item) => {
      const path = await proxy(item, cache);
      return api.video(path, item.key, basename(item.path));
    }));
    for (const [index, item] of group.entries()) {
      const video = videos[index];
      if (video.status === "rejected") throw video.reason;
      input.push(textPart("Next video file: " + item.name), video.value);
    }
  }
  return input;
}

function analysisReport(results: {job: Job; result: GeminiResult}[], final: GeminiResult, sourceCount: number): string {
  const rows = results.map(({job, result}) => {
    const verification = result.processingCalls && result.processingResults
      ? result.processingCalls + " calls / " + result.processingResults + " results"
      : "Agentic requested, processing trace unavailable";
    const missing = job.assets.filter((item) => !result.text.includes(basename(item.path)));
    const coverage = missing.length ? missing.length + " filenames absent from response" : "All filenames present";
    return "| " + job.label + " | " + job.assets.length + " | " + verification + " | " + coverage + " |";
  });
  const appendices = results.map(({job, result}) => "## " + job.label + "\n\n" + result.text).join("\n\n");
  return [
    "# Gemini video analysis", MODEL + " · " + sourceCount + " source videos",
    "| Pass | Files | Gemini processing trace | Filename coverage |\n| --- | ---: | --- | --- |\n" + rows.join("\n"),
    final.text, "# Source analysis and reference notes\n\n" + appendices,
  ].join("\n\n") + "\n";
}

export async function run(argv: string[]): Promise<void> {
  const {positionals, values} = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      help: {type: "boolean"}, prompt: {type: "string"}, reference: {type: "string", multiple: true},
      "batch-size": {type: "string"}, rotate: {type: "string", multiple: true}, "dry-run": {type: "boolean"},
    },
  });
  if (values.help || !positionals.length) {
    console.log(USAGE);
    return;
  }
  const [command, id, sourcePath, ...extra] = positionals;
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (command === "check" && !id && !values["dry-run"]) {
    if (!key) throw new Error("GEMINI_API_KEY is missing from .env");
    await new GeminiVideoApi(key, "").check();
    console.log("Gemini API key authenticated for model metadata: " + MODEL);
    return;
  }
  if (command !== "analyze" || !id || !ID_RE.test(id) || !sourcePath || !values.prompt || extra.length) {
    throw new Error(USAGE);
  }
  const size = Number(values["batch-size"] ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(size) || size < 1 || size > 8) throw new Error("--batch-size must be between 1 and 8");
  const rotations = (values.rotate ?? []).map((item) => {
    const [prefix, direction, ...rest] = item.split("=");
    if (!prefix || (direction !== "clock" && direction !== "cclock") || rest.length) {
      throw new Error("--rotate expects a filename prefix and direction, e.g. C00=clock");
    }
    return {prefix: prefix.toLowerCase(), direction};
  });
  const source = resolve(sourcePath);
  const refs = [...new Set((values.reference ?? []).map((path) => resolve(path)))];
  if (refs.length > 2) throw new Error("Specify up to two reference videos.");
  const refSet = new Set(refs.map((path) => process.platform === "win32" ? path.toLowerCase() : path));
  const candidates = (await mediaIn(source)).filter((path) =>
    !refSet.has(process.platform === "win32" ? path.toLowerCase() : path));
  if (!candidates.length) throw new Error("No supported source videos found in " + source);
  const prompt = (await readFile(resolve(values.prompt), "utf8")).trim();
  if (!prompt) throw new Error("The master prompt is empty.");
  const references = await Promise.all(refs.map((path, i) => asset(path, "REF " + (i + 1) + " — " + basename(path))));
  const footage = await Promise.all(candidates.map((path) => asset(path, relative(source, path),
    rotations.find(({prefix}) => basename(path).toLowerCase().startsWith(prefix))?.direction as Asset["rotation"])));
  const jobs: Job[] = [];
  if (references.length) jobs.push({
    label: "reference", assets: references,
    instruction: prompt + "\n\nTHIS PASS: Analyze only the attached references. Identify style evidence and separately transcribe original look labels. Do not propose source timecodes. Timestamp the visual evidence. Reinspect short intervals for small text and cut boundaries.",
  });
  for (let i = 0; i < footage.length; i += size) {
    jobs.push({
      label: "source-" + String(Math.floor(i / size) + 1).padStart(2, "0"), assets: footage.slice(i, i + size),
      instruction: prompt + "\n\nTHIS PASS: Log only the attached camera files. Include one entry for every filename, even when a clip is unusable. Use clip-relative times. Reinspect the movement and garment details before suggesting in/out ranges. Do not write the final timeline yet.",
    });
  }
  const bytes = [...footage, ...references].reduce((total, item) => total + item.size, 0);
  console.log(MODEL + " · " + footage.length + " source videos · " + references.length + " references · " +
    (bytes / 1e9).toFixed(2) + " GB of original media");
  console.log(jobs.map((job) => job.label + " (" + job.assets.length + ")").join(" · ") + " · synthesis");
  if (values["dry-run"]) {
    console.log(jobs.map(({label, assets}) =>
      label + ": " + assets.map((item) => item.name + (item.rotation ? " [" + item.rotation + "]" : "")).join(", ")).join("\n"));
    return;
  }
  if (!key) throw new Error("GEMINI_API_KEY is missing from .env");
  const cache = p(".cache", "gemini-video", id);
  const api = new GeminiVideoApi(key, cache);
  await api.check();
  const results: {job: Job; result: GeminiResult}[] = [];
  for (const job of jobs) {
    console.log("Analyzing " + job.label + " (" + job.assets.length + " videos)...");
    const identity = digest([MODEL, job.instruction, job.assets.map((item) => [item.name, item.key])]);
    const result = await api.analyze(job.label, identity, true, () => prepareInput(job, api, cache));
    results.push({job, result});
  }
  const notes = results.map(({job, result}) => "## " + job.label + "\n\n" + result.text).join("\n\n");
  const synthesis = prompt + "\n\nTHIS PASS: Use the timestamped source logs and reference notes below to write the final strategy, edit decision list and editor prompt. Ground filenames, time ranges and wording in these notes. Explicitly list missing or uncertain details.\n\n" + notes;
  console.log("Synthesizing the edit strategy...");
  const final = await api.analyze("synthesis", digest([MODEL, synthesis]), false, async () => [textPart(synthesis)]);
  const path = join(outDir(id), "Gemini-Video-Analysis.md");
  await writeAtomic(path, analysisReport(results, final, footage.length));
  console.log("Saved " + path);
}

if (import.meta.main) {
  await run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
