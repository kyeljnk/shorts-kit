/**
 * Generate or resume video clips with Black Forest Labs FLUX 3 Max on fal.ai.
 *
 * Endpoints:
 * - blackforestlabs/flux-3-max/text-to-video
 * - blackforestlabs/flux-3-max/image-to-video
 * - blackforestlabs/flux-3-max/keyframes-to-video
 *
 * Persists task receipts in .cache/fal/ so interrupted runs resume polling
 * instead of submitting a duplicate paid generation. Never logs FAL_KEY.
 */
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, extname, join, resolve} from "node:path";

const QUEUE_BASE = "https://queue.fal.run/blackforestlabs/flux-3-max";
const MODELS_API = "https://api.fal.ai/v1/models";
const POLL_MS = 2500;
const TIMEOUT_MS = 10 * 60_000;

const ASPECTS = ["auto", "21:9", "2:1", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;
const RESOLUTIONS = ["720p", "1080p", "2K", "4K"] as const;
const REASONING = ["low", "high"] as const;
const MODES = ["text-to-video", "image-to-video", "keyframes-to-video"] as const;
type Mode = (typeof MODES)[number];

type QueueStatus = {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
  request_id: string;
  response_url?: string;
  status_url?: string;
  cancel_url?: string;
  queue_position?: number;
};

type VideoOutput = {
  seed?: number;
  timings?: Record<string, number>;
  video?: {
    url: string;
    content_type?: string | null;
    file_name?: string | null;
    file_size?: number | null;
    width?: number | null;
    height?: number | null;
    fps?: number | null;
    duration?: number | null;
    num_frames?: number | null;
  };
};

type Receipt = {
  state: "submitting" | "submitted" | "completed";
  endpoint: string;
  requestId?: string;
  statusUrl?: string;
  responseUrl?: string;
  cancelUrl?: string;
  createdAt: string;
  result?: VideoOutput;
};

const usage = (): never => {
  console.error(`Usage:
  bun run fal check
  bun run fal status <request_id> [--out <file.mp4>]
  bun run fal text-to-video --prompt "..." --out <file.mp4> [options]
  bun run fal image-to-video --image <url|file> [--end-image <url|file>] --prompt "..." --out <file.mp4> [options]
  bun run fal keyframes-to-video --keyframe <frame:url|file> [...] --prompt "..." --out <file.mp4> [options]

Options:
  --duration <5..20>                Video duration in seconds (default: 5)
  --aspect <9:16|auto|16:9|...>     Aspect ratio (default: 9:16 for Shorts)
  --resolution <720p|1080p|2K|4K>   Output resolution (default: 720p)
  --reasoning <high|low>            Prompt reasoning level (default: high)
  --audio / --no-audio              Generate native audio (default: true)
  --seed <int>                      Optional random seed
  --request-id <id>                 Resume a specific fal request_id
  --force                           Ignore existing receipt and submit a new job`);
  process.exit(1);
};

const getKey = (): string => {
  const key = (process.env.FAL_KEY || process.env.FAL_API_KEY || "").trim();
  if (!key) {
    console.error("FAL_KEY is missing from .env");
    process.exit(1);
  }
  return key;
};

const toImageInput = async (val: string): Promise<string> => {
  if (/^https?:\/\//i.test(val) || /^data:image\//i.test(val)) return val;
  const full = resolve(val);
  if (!existsSync(full)) throw new Error(`Image file not found: ${val}`);
  const ext = extname(full).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    ext === ".webp" ? "image/webp" : null;
  if (!mime) throw new Error(`Unsupported image extension "${ext}" (use PNG, JPEG, or WebP)`);
  const bytes = await readFile(full);
  return `data:${mime};base64,${bytes.toString("base64")}`;
};

const downloadVideo = async (url: string, outPath: string) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Refusing non-HTTPS video URL from fal.ai");
  const res = await fetch(parsed, {signal: AbortSignal.timeout(180_000)});
  if (!res.ok) throw new Error(`Video download failed (HTTP ${res.status})`);
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error("Downloaded video is empty");
  await mkdir(dirname(outPath), {recursive: true});
  await writeFile(outPath, new Uint8Array(bytes));
};

const pollAndDownload = async (
  headers: Record<string, string>,
  requestId: string,
  statusUrl: string,
  responseUrl: string,
  outPath?: string,
): Promise<VideoOutput> => {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, {headers, signal: AbortSignal.timeout(30_000)});
    if (!res.ok) throw new Error(`fal status check for ${requestId} returned HTTP ${res.status}`);
    const status = (await res.json()) as QueueStatus;
    if (status.status === "COMPLETED") {
      const resultRes = await fetch(responseUrl, {headers, signal: AbortSignal.timeout(60_000)});
      if (!resultRes.ok) throw new Error(`fal result fetch for ${requestId} returned HTTP ${resultRes.status}`);
      const output = (await resultRes.json()) as VideoOutput;
      if (!output.video?.url) throw new Error(`fal request ${requestId} completed without video.url`);
      if (outPath) {
        await downloadVideo(output.video.url, outPath);
      }
      return output;
    }
    const pos = status.queue_position !== undefined ? ` (pos ${status.queue_position})` : "";
    console.error(`  … fal ${requestId}: ${status.status}${pos}`);
    await Bun.sleep(POLL_MS);
  }
  throw new Error(`fal request ${requestId} timed out; rerun the same command to resume polling`);
};

const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd) usage();

const key = getKey();
const authHeaders = {Authorization: `Key ${key}`};

if (cmd === "check") {
  const url = new URL(`${MODELS_API}/pricing`);
  for (const m of MODES) url.searchParams.append("endpoint_id", `blackforestlabs/flux-3-max/${m}`);
  const res = await fetch(url, {headers: authHeaders, signal: AbortSignal.timeout(30_000)});
  if (!res.ok) {
    console.error(`fal check failed with HTTP ${res.status}`);
    process.exit(1);
  }
  const data: unknown = await res.json();
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  process.exit(0);
}

if (cmd === "status") {
  const requestId = args[1];
  if (!requestId || requestId.startsWith("--")) usage();
  let outPath: string | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      outPath = resolve(args[++i]);
    } else usage();
  }
  const statusUrl = `${QUEUE_BASE}/requests/${encodeURIComponent(requestId)}/status`;
  const responseUrl = `${QUEUE_BASE}/requests/${encodeURIComponent(requestId)}`;
  const res = await fetch(statusUrl, {headers: authHeaders, signal: AbortSignal.timeout(30_000)});
  if (!res.ok) {
    console.error(`fal status for ${requestId} returned HTTP ${res.status}`);
    process.exit(1);
  }
  const status = (await res.json()) as QueueStatus;
  if (status.status === "COMPLETED" && outPath) {
    const output = await pollAndDownload(authHeaders, requestId, statusUrl, responseUrl, outPath);
    process.stdout.write(JSON.stringify({status, output, savedTo: outPath}, null, 2) + "\n");
  } else {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
  }
  process.exit(0);
}

if (!MODES.includes(cmd as Mode)) usage();
const mode = cmd as Mode;

let prompt = "";
let outFile = "";
let image = "";
let endImage = "";
const keyframesRaw: string[] = [];
let duration = 5;
let aspect: (typeof ASPECTS)[number] = "9:16";
let resolution: (typeof RESOLUTIONS)[number] = "720p";
let reasoning: (typeof REASONING)[number] = "high";
let generateAudio = true;
let seed: number | undefined;
let manualRequestId: string | undefined;
let force = false;

for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === "--prompt" && args[i + 1]) prompt = args[++i].trim();
  else if (a === "--out" && args[i + 1]) outFile = args[++i].trim();
  else if (a === "--image" && args[i + 1]) image = args[++i].trim();
  else if (a === "--end-image" && args[i + 1]) endImage = args[++i].trim();
  else if (a === "--keyframe" && args[i + 1]) keyframesRaw.push(args[++i].trim());
  else if (a === "--duration" && args[i + 1]) duration = Number.parseInt(args[++i], 10);
  else if (a === "--aspect" && args[i + 1]) aspect = args[++i] as (typeof ASPECTS)[number];
  else if (a === "--resolution" && args[i + 1]) resolution = args[++i] as (typeof RESOLUTIONS)[number];
  else if (a === "--reasoning" && args[i + 1]) reasoning = args[++i] as (typeof REASONING)[number];
  else if (a === "--audio") generateAudio = true;
  else if (a === "--no-audio") generateAudio = false;
  else if (a === "--seed" && args[i + 1]) seed = Number.parseInt(args[++i], 10);
  else if (a === "--request-id" && args[i + 1]) manualRequestId = args[++i].trim();
  else if (a === "--force") force = true;
  else usage();
}

if (!prompt || !outFile) usage();
if (!Number.isInteger(duration) || duration < 5 || duration > 20) {
  console.error("--duration must be an integer between 5 and 20 seconds.");
  process.exit(1);
}
if (!ASPECTS.includes(aspect)) {
  console.error(`--aspect must be one of: ${ASPECTS.join(", ")}`);
  process.exit(1);
}
if (!RESOLUTIONS.includes(resolution)) {
  console.error(`--resolution must be one of: ${RESOLUTIONS.join(", ")}`);
  process.exit(1);
}
if (!REASONING.includes(reasoning)) {
  console.error(`--reasoning must be one of: ${REASONING.join(", ")}`);
  process.exit(1);
}

const endpoint = `blackforestlabs/flux-3-max/${mode}`;
const payload: Record<string, unknown> = {
  prompt,
  duration,
  resolution,
  reasoning_level: reasoning,
  aspect_ratio: aspect,
  generate_audio: generateAudio,
};
if (seed !== undefined && Number.isInteger(seed)) payload.seed = seed;

if (mode === "image-to-video") {
  if (!image) {
    console.error("image-to-video requires --image <url|file>");
    process.exit(1);
  }
  payload.image_url = await toImageInput(image);
  if (endImage) payload.end_image_url = await toImageInput(endImage);
} else if (mode === "keyframes-to-video") {
  if (!keyframesRaw.length || keyframesRaw.length > 10) {
    console.error("keyframes-to-video requires 1..10 --keyframe <frame_index:url|file> arguments");
    process.exit(1);
  }
  const keyframes: {frame_index: number; image_url: string}[] = [];
  for (const item of keyframesRaw) {
    const idx = item.indexOf(":");
    if (idx <= 0) {
      console.error(`Invalid --keyframe "${item}". Expected <frame_index>:<url|file>`);
      process.exit(1);
    }
    const frameIndex = Number.parseInt(item.slice(0, idx), 10);
    const src = item.slice(idx + 1);
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex > duration * 24) {
      console.error(`Keyframe frame_index ${frameIndex} must be between 0 and ${duration * 24}`);
      process.exit(1);
    }
    keyframes.push({frame_index: frameIndex, image_url: await toImageInput(src)});
  }
  payload.keyframes = keyframes;
}

const outPath = resolve(outFile);
const cacheDir = join(process.cwd(), ".cache", "fal");
await mkdir(cacheDir, {recursive: true});
const hash = createHash("sha256").update(JSON.stringify({endpoint, payload, outPath})).digest("hex").slice(0, 24);
const receiptPath = join(cacheDir, `${hash}.json`);

let receipt: Receipt | undefined =
  !force && existsSync(receiptPath) ? (JSON.parse(readFileSync(receiptPath, "utf8")) as Receipt) : undefined;

if (manualRequestId) {
  receipt = {
    state: "submitted",
    endpoint,
    requestId: manualRequestId,
    statusUrl: `${QUEUE_BASE}/requests/${encodeURIComponent(manualRequestId)}/status`,
    responseUrl: `${QUEUE_BASE}/requests/${encodeURIComponent(manualRequestId)}`,
    createdAt: new Date().toISOString(),
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
}

if (receipt?.state === "completed" && existsSync(outPath) && !force) {
  console.log(JSON.stringify({cached: true, outPath, receiptPath, receipt}, null, 2));
  process.exit(0);
}

if (receipt?.state === "submitting") {
  console.error(
    `Submission outcome is unknown in ${receiptPath}. Check fal dashboard or pass --request-id <id> / --force before retrying.`,
  );
  process.exit(1);
}

if (!receipt) {
  receipt = {state: "submitting", endpoint, createdAt: new Date().toISOString()};
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  const submitRes = await fetch(`${QUEUE_BASE}/${mode}`, {
    method: "POST",
    headers: {...authHeaders, "Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  if (!submitRes.ok) {
    throw new Error(`fal submission returned HTTP ${submitRes.status}; check ${receiptPath}`);
  }
  const queued = (await submitRes.json()) as QueueStatus;
  if (!queued.request_id) {
    throw new Error(`fal submission returned no request_id; check ${receiptPath}`);
  }
  receipt = {
    state: "submitted",
    endpoint,
    requestId: queued.request_id,
    statusUrl: queued.status_url || `${QUEUE_BASE}/requests/${encodeURIComponent(queued.request_id)}/status`,
    responseUrl: queued.response_url || `${QUEUE_BASE}/requests/${encodeURIComponent(queued.request_id)}`,
    cancelUrl: queued.cancel_url || `${QUEUE_BASE}/requests/${encodeURIComponent(queued.request_id)}/cancel`,
    createdAt: receipt.createdAt,
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  console.error(`  + fal submitted ${endpoint}: request_id=${queued.request_id}`);
}

if (!receipt.requestId || !receipt.statusUrl || !receipt.responseUrl) {
  throw new Error(`Incomplete fal receipt in ${receiptPath}`);
}

const output = await pollAndDownload(authHeaders, receipt.requestId, receipt.statusUrl, receipt.responseUrl, outPath);
receipt.state = "completed";
receipt.result = output;
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
process.stdout.write(JSON.stringify({outPath, receiptPath, requestId: receipt.requestId, output}, null, 2) + "\n");
