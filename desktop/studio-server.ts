/**
 * Shorts Kit Studio — Local Desktop Backend Server
 * Runs with bundled Bun + FFmpeg + FFprobe and serves the Vietnamese-first Studio UI.
 */
import {existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync, cpSync, symlinkSync, type Stats} from "node:fs";
import {dirname, join, resolve, sep} from "node:path";

const STUDIO_DIR = import.meta.dir;
const REPO_FALLBACK = resolve(STUDIO_DIR, "..");

const argv = process.argv.slice(2);
const argVal = (name: string): string | undefined => {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
};

const PORT = Number(argVal("port") ?? process.env.PREVIEW_PORT ?? 7788);
const ROOT = resolve(argVal("workspace") ?? process.env.SHORTS_KIT_WORKSPACE ?? REPO_FALLBACK);
const TEMPLATE_DIR = argVal("template") ? resolve(argVal("template")!) : (existsSync(join(STUDIO_DIR, "..", "template")) ? resolve(STUDIO_DIR, "..", "template") : REPO_FALLBACK);
const DIST_UI_DIR = argVal("dist-ui") ? resolve(argVal("dist-ui")!) : join(STUDIO_DIR, "dist-ui");
const RUNTIME_DIR = dirname(process.execPath);

const sepPath = process.platform === "win32" ? ";" : ":";
const curPath = process.env.PATH ?? "";
if (!curPath.toLowerCase().includes(RUNTIME_DIR.toLowerCase())) {
  process.env.PATH = `${RUNTIME_DIR}${sepPath}${curPath}`;
}

if (!existsSync(ROOT)) mkdirSync(ROOT, {recursive: true});
const ROOT_REAL = realpathSync(ROOT);
const CACHE_DIR = join(ROOT, ".cache", "studio");
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const stat = (f: string): Stats | null => {
  try {
    return statSync(f);
  } catch {
    return null;
  }
};
const isFile = (f: string) => stat(f)?.isFile() ?? false;
const readText = (f: string): string | null => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return null;
  }
};
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

const jsonCache = new Map<string, {key: string; value: unknown; error?: string}>();
const readJson = <T>(f: string): {value: T | null; error?: string} => {
  const st = stat(f);
  if (!st) return {value: null};
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = jsonCache.get(f);
  if (hit && hit.key === key) return {value: hit.value as T, error: hit.error};
  let value: unknown = null;
  let error: string | undefined;
  try {
    value = JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    error = (e as Error).message;
  }
  jsonCache.set(f, {key, value, error});
  return {value: value as T, error};
};

const parseEnvFile = (file: string): Record<string, string> => {
  const txt = readText(file);
  if (!txt) return {};
  const out: Record<string, string> = {};
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
};

const ENV_KEYS = [
  {key: "AI33_API_KEY", label: "AI33 TTS (Giọng đọc tiếng Việt)", required: true, hint: "Dùng để tạo giọng đọc tiếng Việt Vbee Minh Quân & các giọng AI33"},
  {key: "SERPER_API_KEY", label: "Serper Search (Tìm tin & ảnh Google)", required: false, hint: "Giúp AI tự tìm kiếm thông tin xác thực và hình ảnh"},
  {key: "PEXELS_API_KEY", label: "Pexels Stock Media", required: false, hint: "Kho video và ảnh nền miễn phí chất lượng cao"},
  {key: "PIXABAY_API_KEY", label: "Pixabay Stock Media", required: false, hint: "Kho ảnh và video minh họa miễn phí"},
  {key: "FAL_KEY", label: "fal.ai (Tạo video AI FLUX 3 Max)", required: false, hint: "Tùy chọn: chỉ cần khi muốn AI tạo cảnh video chuyển động"},
  {key: "GEMINI_API_KEY", label: "Gemini API (Phân tích video)", required: false, hint: "Tùy chọn: chỉ cần khi phân tích video có sẵn"},
  {key: "ELEVENLABS_API_KEY", label: "ElevenLabs TTS", required: false, hint: "Tùy chọn: thay thế AI33 nếu dùng giọng ElevenLabs"},
] as const;

const loadWorkspaceEnv = () => parseEnvFile(join(ROOT, ".env"));

const runCmd = async (cmd: string[], timeoutMs: number, onChunk?: (line: string) => void) => {
  const wsEnv = loadWorkspaceEnv();
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: {...process.env, ...wsEnv, FORCE_COLOR: "0", NO_COLOR: "1"},
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGKILL");
    } catch {}
  }, timeoutMs);

  let stdout = "";
  let stderr = "";
  const readStream = async (stream: ReadableStream<Uint8Array> | null, isErr: boolean) => {
    if (!stream) return;
    const dec = new TextDecoder();
    const reader = stream.getReader();
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, {stream: true});
      if (isErr) stderr += chunk;
      else stdout += chunk;
      if (onChunk) {
        for (const l of stripAnsi(chunk).split(/\r?\n/)) {
          if (l.trim()) onChunk(l);
        }
      }
    }
  };

  await Promise.all([readStream(proc.stdout, false), readStream(proc.stderr, true)]);
  const code = await proc.exited;
  clearTimeout(timer);
  return {code: timedOut ? 124 : code, stdout, stderr, timedOut};
};

type HashFn = (n: any) => string;
let voiceHash: HashFn | null = null;
const initVoiceHash = async () => {
  try {
    const narTs = join(ROOT, "scripts", "lib", "narration.ts");
    const mod = await import(existsSync(narTs) ? narTs : join(REPO_FALLBACK, "scripts", "lib", "narration.ts"));
    if (typeof mod.voiceHash === "function") {
      const h = mod.voiceHash as HashFn;
      const defPause = mod.DEFAULT_PAUSE ?? {line: 0.2, scene: 0.3};
      voiceHash = (id: string) => {
        const raw = JSON.parse(readFileSync(join(ROOT, "src", "videos", id, "narration.json"), "utf8"));
        return h({...raw, pause: {...defPause, ...(raw.pause ?? {})}, voice: {tempo: 1, ...(raw.voice ?? {engine: "say"})}, scenes: raw.scenes ?? []});
      };
    }
  } catch {}
};
await initVoiceHash();

const loadCache = <T>(name: string): Record<string, T> => {
  try {
    return JSON.parse(readFileSync(join(CACHE_DIR, name), "utf8"));
  } catch {
    return {};
  }
};
const saveCache = (name: string, data: unknown) => {
  try {
    mkdirSync(CACHE_DIR, {recursive: true});
    writeFileSync(join(CACHE_DIR, name), JSON.stringify(data, null, 1));
  } catch {}
};

type LintResult = {at: number; code: number; timedOut: boolean; errors: number | null; warnings: number | null; output: string; ms: number};
const lintCache = loadCache<LintResult>("lint.json");
const lintRunning = new Map<string, Promise<LintResult>>();

const runLint = (id: string): Promise<LintResult> => {
  const running = lintRunning.get(id);
  if (running) return running;
  const job = (async () => {
    const t0 = Date.now();
    const r = await runCmd([process.execPath, "run", "lint", id], 60_000);
    const output = stripAnsi(`${r.stdout}${r.stderr ? `\n${r.stderr}` : ""}`).trim();
    const m = output.match(/lint \S+: (\d+) errors?, (\d+) warnings?/);
    const res: LintResult = {
      at: Date.now(),
      code: r.code,
      timedOut: r.timedOut,
      errors: m ? Number(m[1]) : null,
      warnings: m ? Number(m[2]) : null,
      output,
      ms: Date.now() - t0,
    };
    lintCache[id] = res;
    saveCache("lint.json", lintCache);
    return res;
  })().finally(() => lintRunning.delete(id));
  lintRunning.set(id, job);
  return job;
};

type TaskState = {
  id: string;
  videoId: string;
  action: string;
  status: "idle" | "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  currentStep?: string;
  logs: string[];
  error?: string;
};
let activeTask: TaskState = {id: "", videoId: "", action: "", status: "idle", startedAt: 0, logs: []};

const pushTaskLog = (line: string) => {
  activeTask.logs.push(line);
  if (activeTask.logs.length > 250) activeTask.logs.shift();
};

const runTaskSequence = async (videoId: string, action: string) => {
  if (activeTask.status === "running") {
    throw new Error(`Đang có tác vụ "${activeTask.action}" cho video "${activeTask.videoId}" đang chạy.`);
  }
  const stepsByAction: Record<string, {label: string; args: string[]; timeout: number}[]> = {
    lint: [{label: "Kiểm tra kịch bản & quy tắc (Lint)", args: ["run", "lint", videoId], timeout: 60_000}],
    tts: [{label: "Tạo giọng đọc AI (TTS)", args: ["run", "tts", videoId], timeout: 15 * 60_000}],
    render: [{label: "Render video Remotion", args: ["run", "render", videoId], timeout: 60 * 60_000}],
    cover: [{label: "Xuất ảnh bìa (Cover)", args: ["run", "cover", videoId], timeout: 10 * 60_000}],
    normalize: [{label: "Chuẩn hóa âm lượng (-13 LUFS)", args: ["run", "normalize", videoId], timeout: 10 * 60_000}],
    encode: [{label: "Đóng gói MP4 chuẩn đăng bài", args: ["run", "encode", videoId], timeout: 10 * 60_000}],
    publish_all: [
      {label: "1/4 Render video Remotion", args: ["run", "render", videoId], timeout: 60 * 60_000},
      {label: "2/4 Xuất ảnh bìa (Cover)", args: ["run", "cover", videoId], timeout: 10 * 60_000},
      {label: "3/4 Chuẩn hóa âm lượng (-13 LUFS)", args: ["run", "normalize", videoId], timeout: 10 * 60_000},
      {label: "4/4 Đóng gói MP4 chuẩn TikTok/Reels/Shorts", args: ["run", "encode", videoId], timeout: 10 * 60_000},
    ],
  };

  const steps = stepsByAction[action];
  if (!steps) throw new Error(`Không hỗ trợ tác vụ: ${action}`);

  activeTask = {
    id: `${Date.now()}`,
    videoId,
    action,
    status: "running",
    startedAt: Date.now(),
    currentStep: steps[0].label,
    logs: [`▶ Bắt đầu: ${action} cho "${videoId}"...`],
  };

  (async () => {
    try {
      for (const s of steps) {
        activeTask.currentStep = s.label;
        pushTaskLog(`\n── ${s.label} ──`);
        const res = await runCmd([process.execPath, ...s.args], s.timeout, pushTaskLog);
        if (res.code !== 0) {
          throw new Error(`Bước "${s.label}" lỗi (exit ${res.code}).`);
        }
      }
      activeTask.status = "done";
      activeTask.currentStep = "Hoàn tất";
      activeTask.endedAt = Date.now();
      pushTaskLog("\n✅ Hoàn tất toàn bộ!");
    } catch (e) {
      activeTask.status = "error";
      activeTask.endedAt = Date.now();
      activeTask.error = (e as Error).message;
      pushTaskLog(`\n❌ Lỗi: ${activeTask.error}`);
    }
  })();
};

type Check = {name: string; ok: boolean; value: string; want: string};
type ProbeSummary = {file: string; size: number; mtime: number; error?: string; video?: Record<string, unknown>; audio?: Record<string, unknown>; faststart: boolean | null; duration: number | null; checks: Check[]};
const probeCache = loadCache<ProbeSummary>("probe.json");

const moovFirst = async (file: string): Promise<boolean | null> => {
  const f = Bun.file(file);
  const size = f.size;
  let off = 0;
  for (let i = 0; i < 64 && off + 8 <= size; i++) {
    const head = new DataView(await f.slice(off, off + 16).arrayBuffer());
    let boxSize = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (boxSize === 1) boxSize = Number(head.getBigUint64(8));
    else if (boxSize === 0) return null;
    if (boxSize < 8) return null;
    off += boxSize;
  }
  return null;
};

const probe = async (file: string, relPath: string): Promise<ProbeSummary> => {
  const st = stat(file)!;
  const key = `${relPath}:${st.mtimeMs}:${st.size}`;
  if (probeCache[key]) return probeCache[key];
  const base = {file: relPath, size: st.size, mtime: st.mtimeMs};
  const r = await runCmd(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 20_000);
  if (r.code !== 0) {
    return {...base, error: r.timedOut ? "ffprobe timeout" : `ffprobe exited ${r.code}`, faststart: null, duration: null, checks: []};
  }
  let j: {format?: Record<string, any>; streams?: Record<string, any>[]};
  try {
    j = JSON.parse(r.stdout);
  } catch {
    return {...base, error: "ffprobe invalid JSON", faststart: null, duration: null, checks: []};
  }
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const faststart = await moovFirst(file).catch(() => null);
  const ck = (name: string, value: unknown, want: string, ok: boolean): Check => ({name, ok, value: String(value ?? "missing"), want});
  const checks: Check[] = [
    ck("video codec", v?.codec_name, "h264", v?.codec_name === "h264"),
    ck("size", v ? `${v.width}×${v.height}` : null, "1080×1920", v?.width === 1080 && v?.height === 1920),
    ck("pix_fmt", v?.pix_fmt, "yuv420p", v?.pix_fmt === "yuv420p"),
    ck("audio codec", a?.codec_name, "aac", a?.codec_name === "aac"),
    ck("audio rate", a?.sample_rate, "48000", Number(a?.sample_rate) === 48000),
    ck("faststart", faststart ? "moov before mdat" : "other", "moov before mdat", faststart === true),
  ];
  const outRes: ProbeSummary = {
    ...base,
    video: v && {codec: v.codec_name, width: v.width, height: v.height, pix_fmt: v.pix_fmt, fps: v.r_frame_rate},
    audio: a && {codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels},
    faststart,
    duration: j.format?.duration ? Number(j.format.duration) : null,
    checks,
  };
  probeCache[key] = outRes;
  saveCache("probe.json", probeCache);
  return outRes;
};

type Status = "done" | "todo" | "warn" | "fail" | "unknown";
type Step = {key: string; n: number; label: string; status: Status; detail: string; command: string; skill: string};
type FileInfo = {path: string; size: number; mtime: number} | null;

const rel = (abs: string) => abs.slice(ROOT.length + 1).replaceAll(sep, "/");
const out = (id: string, ...parts: string[]) => join(ROOT, "out", id, ...parts);
const fileInfo = (abs: string): FileInfo => {
  const s = stat(abs);
  return s?.isFile() ? {path: rel(abs), size: s.size, mtime: s.mtimeMs} : null;
};

const listVideos = () => {
  const dir = join(ROOT, "src", "videos");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, {withFileTypes: true})
    .filter((d) => d.isDirectory() && d.name !== "_template" && d.name !== "gallery" && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
};

const stills = (id: string) => {
  const dir = out(id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^still-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.slice(6, -4)) - Number(b.slice(6, -4)))
    .map((f) => fileInfo(join(dir, f))!)
    .filter(Boolean);
};

const STEP_LABELS: Record<string, {n: number; label: string; skill: string; cmd: (id: string) => string}> = {
  brief: {n: 1, label: "Ý tưởng & Brief", skill: "sk-brief", cmd: (id) => `briefs/${id}.md`},
  facts: {n: 2, label: "Kiểm chứng nguồn", skill: "sk-facts", cmd: () => `bun run facts`},
  narration: {n: 3, label: "Kịch bản lời thoại", skill: "sk-narration", cmd: (id) => `src/videos/${id}/narration.json`},
  tts: {n: 4, label: "Giọng đọc AI (TTS)", skill: "sk-narration", cmd: (id) => `bun run tts ${id}`},
  lint: {n: 5, label: "Kiểm tra quy chuẩn", skill: "sk-narration", cmd: (id) => `bun run lint ${id}`},
  storyboard: {n: 6, label: "Bảng phân cảnh", skill: "sk-scene", cmd: (id) => `bun run storyboard ${id}`},
  scenes: {n: 7, label: "Dựng cảnh Remotion", skill: "sk-scene", cmd: (id) => `bun run dev ${id}`},
  render: {n: 8, label: "Render MP4", skill: "sk-render", cmd: (id) => `bun run render ${id}`},
  cover: {n: 9, label: "Ảnh bìa Cover", skill: "sk-handoff", cmd: (id) => `bun run cover ${id}`},
  normalize: {n: 10, label: "Chuẩn âm lượng", skill: "sk-render", cmd: (id) => `bun run normalize ${id}`},
  encode: {n: 11, label: "Đóng gói Upload", skill: "sk-render", cmd: (id) => `bun run encode ${id}`},
  handoff: {n: 12, label: "Caption & Hashtag", skill: "sk-handoff", cmd: (id) => `out/${id}/caption.txt`},
};

const videoState = (id: string) => {
  const dir = join(ROOT, "src", "videos", id);
  const narrationPath = join(dir, "narration.json");
  const voicePath = join(dir, "voice.json");
  const nar = readJson<{flow?: string; scenes?: {id: string; lines?: {text?: string; fact?: string}[]}[]; voice?: {engine?: string}}>(narrationPath);
  const voi = readJson<{estimated?: boolean; hash?: string; engine?: string; duration?: number; words?: unknown[]; lines?: unknown[]; scenes?: {id: string; start: number; end: number}[]; audio?: string}>(voicePath);
  const n = nar.value;
  const voice = voi.value;

  const steps: Step[] = [];
  const add = (key: string, status: Status, detail: string) => {
    const m = STEP_LABELS[key];
    steps.push({key, n: m.n, label: m.label, status, detail, command: m.cmd(id), skill: m.skill});
  };

  add("brief", isFile(join(ROOT, "briefs", `${id}.md`)) ? "done" : "todo", isFile(join(ROOT, "briefs", `${id}.md`)) ? `briefs/${id}.md` : "Chưa có brief");

  const factIds = (n?.scenes ?? []).flatMap((s) => s.lines ?? []).map((l) => l.fact).filter(Boolean) as string[];
  add("facts", factIds.length ? "done" : n ? "warn" : "todo", factIds.length ? `${factIds.length} nguồn đã trích dẫn` : "Chưa trích dẫn fact id");

  const lineCount = (n?.scenes ?? []).flatMap((s) => s.lines ?? []).length;
  add("narration", nar.error ? "fail" : lineCount > 0 ? "done" : "todo", nar.error ? nar.error : lineCount > 0 ? `${lineCount} câu / ${n?.scenes?.length ?? 0} cảnh` : "Chưa có lời thoại");

  if (!voice) add("tts", "todo", "Chưa tạo giọng đọc");
  else if (voice.estimated) add("tts", "todo", "Đang dùng ước lượng (chưa chạy TTS)");
  else {
    const audio = voice.audio ? join(ROOT, "public", voice.audio) : null;
    const stale = voiceHash && n ? voiceHash(id) !== voice.hash : false;
    if (stale) add("tts", "warn", "Kịch bản đã sửa — cần chạy lại TTS");
    else if (!audio || !isFile(audio)) add("tts", "warn", "Thiếu file audio");
    else add("tts", "done", `${voice.engine ?? "ai33"} · ${(voice.duration ?? 0).toFixed(1)}s`);
  }

  const lint = lintCache[id];
  if (!lint) add("lint", "unknown", "Chưa chạy kiểm tra");
  else add("lint", lint.code === 0 ? (lint.warnings ? "warn" : "done") : "fail", `${lint.errors ?? "?"} lỗi, ${lint.warnings ?? "?"} cảnh báo`);

  const sb = readJson<{shots?: {status?: string}[]}>(join(dir, "storyboard.json"));
  const shots = sb.value?.shots ?? [];
  add("storyboard", shots.length ? "done" : "todo", shots.length ? `${shots.length} phân cảnh` : "Chưa có storyboard");

  const st = stills(id);
  const render = fileInfo(out(id, `${id}.mp4`));
  const loud = fileInfo(out(id, `${id}-loud.mp4`));
  const upload = fileInfo(out(id, `${id}-upload.mp4`));
  const cover = fileInfo(out(id, `${id}-cover.png`)) ?? fileInfo(out(id, `${id}-cover.jpg`));
  const coverJpg = fileInfo(out(id, `${id}-cover.jpg`));
  const caption = fileInfo(out(id, "caption.txt"));
  const pinned = fileInfo(out(id, "pinned.txt")) ?? fileInfo(out(id, "pinned-comment.txt"));

  add("scenes", st.length || render ? "done" : "todo", st.length || render ? "Đã dựng cảnh Remotion" : "Chưa dựng cảnh");
  add("render", render ? "done" : "todo", render ? `${(render.size / 1e6).toFixed(1)} MB` : "Chưa render");
  add("cover", cover ? "done" : "todo", cover ? "Đã có ảnh bìa" : "Chưa xuất ảnh bìa");
  add("normalize", loud ? "done" : "todo", loud ? "Đã chuẩn hóa -13 LUFS" : "Chưa chuẩn hóa âm thanh");
  add("encode", upload ? "done" : "todo", upload ? `${(upload.size / 1e6).toFixed(1)} MB sẵn sàng đăng` : "Chưa đóng gói MP4");
  add("handoff", caption ? "done" : "todo", caption ? "Đã có caption.txt" : "Chưa có caption");

  const firstTodo = steps.find((s) => s.status !== "done");
  const next = firstTodo
    ? {key: firstTodo.key, label: firstTodo.label, command: firstTodo.command, skill: firstTodo.skill, detail: firstTodo.detail}
    : {key: "done", label: "Sẵn sàng đăng", command: `out/${id}/${id}-upload.mp4`, skill: "sk-handoff", detail: "Tất cả các bước đã hoàn thành"};

  return {
    id,
    kind: "video" as const,
    flow: n?.flow ?? null,
    steps,
    next,
    files: {
      render,
      loud,
      upload,
      cover,
      coverJpg,
      caption,
      pinned,
      stills: st,
      voiceJson: fileInfo(voicePath),
      narrationJson: fileInfo(narrationPath),
      storyboard: fileInfo(join(dir, "storyboard.json")),
      brief: fileInfo(join(ROOT, "briefs", `${id}.md`)),
    },
    voice: voice
      ? {
          engine: voice.engine ?? null,
          estimated: Boolean(voice.estimated),
          duration: voice.duration ?? null,
          words: voice.words?.length ?? null,
          lines: voice.lines?.length ?? null,
          scenes: voice.scenes ?? [],
          audio: voice.audio ? fileInfo(join(ROOT, "public", voice.audio)) : null,
        }
      : null,
    lint: lint ?? null,
    lintRunning: lintRunning.has(id),
  };
};

const findTool = (exe: string) => {
  if (isFile(join(RUNTIME_DIR, exe))) return join(RUNTIME_DIR, exe);
  try {
    return Bun.which(exe.replace(/\.exe$/i, "")) ?? null;
  } catch {
    return null;
  }
};

const detectAiApps = () => {
  const localApp = process.env.LOCALAPPDATA ?? "";
  const progFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const winApps = join(progFiles, "WindowsApps");
  let hasCodex = false;
  let hasChatGPT = false;
  try {
    if (existsSync(winApps)) {
      const dirs = readdirSync(winApps);
      hasCodex = dirs.some((d) => /OpenAI\.Codex/i.test(d));
      hasChatGPT = dirs.some((d) => /OpenAI\.ChatGPT/i.test(d));
    }
  } catch {}
  if (!hasCodex && existsSync(join(localApp, "Programs", "Codex"))) hasCodex = true;
  if (!hasChatGPT && existsSync(join(localApp, "Programs", "ChatGPT"))) hasChatGPT = true;
  return {codex: hasCodex, chatgpt: hasChatGPT};
};

const getTutorialVideoPath = (): string | null => {
  const candidates = [
    join(STUDIO_DIR, "assets", "tutorial.mp4"),
    join(ROOT, "out", "huong-dan-shorts-kit", "huong-dan-shorts-kit-upload.mp4"),
    join(REPO_FALLBACK, "out", "huong-dan-shorts-kit", "huong-dan-shorts-kit-upload.mp4"),
  ];
  for (const c of candidates) if (isFile(c)) return c;
  return null;
};

const syncTemplateIntoWorkspace = () => {
  if (TEMPLATE_DIR === ROOT || !existsSync(TEMPLATE_DIR)) {
    return {synced: false, message: "Workspace đang chạy trực tiếp trên kho nguồn."};
  }
  const syncItems = [".claude", ".agents", "AGENTS.md", "CLAUDE.md", "package.json", "tsconfig.json", "remotion.config.ts", ".env.example", "scripts", "src/shared", "src/videos/_template", "src/videos/gallery", "docs/soul", "docs/flows", "docs/visuals", "docs/making-a-video.md", "docs/storyboard.md", "docs/sfx.md", "public/sfx", "public/fonts"];
  let count = 0;
  for (const relItem of syncItems) {
    const src = join(TEMPLATE_DIR, relItem);
    const dst = join(ROOT, relItem);
    if (!existsSync(src)) continue;
    mkdirSync(dirname(dst), {recursive: true});
    cpSync(src, dst, {recursive: true, force: true});
    count++;
  }
  const nmSrc = join(TEMPLATE_DIR, "node_modules");
  const nmDst = join(ROOT, "node_modules");
  if (existsSync(nmSrc) && !existsSync(nmDst)) {
    try {
      symlinkSync(nmSrc, nmDst, "junction");
    } catch {}
  }
  return {synced: true, count, message: `Đã đồng bộ ${count} thành phần từ bản chuẩn.`};
};

const ALLOWED = [
  /^out\/[^/]+\/[^/]+$/,
  /^public\/audio\/.+$/,
  /^public\/sfx\/.+$/,
  /^briefs\/[^/]+\.md$/,
  /^src\/videos\/[^/]+\/(narration|voice|storyboard)\.json$/,
  /^docs\/facts\/(facts|sources)\.json$/,
];
const BASES = ["out", "public/audio", "public/sfx", "briefs", "src/videos", "docs/facts"];

const safePath = (raw: string): string | null => {
  let r: string;
  try {
    r = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (r.includes("\0") || r.includes("\\")) return null;
  const parts = r.split("/").filter(Boolean);
  if (parts.some((p) => p === ".." || p === "." || p.startsWith("."))) return null;
  r = parts.join("/");
  if (!ALLOWED.some((re) => re.test(r))) return null;
  const abs = resolve(ROOT, r);
  if (!abs.startsWith(ROOT + sep)) return null;
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    return null;
  }
  if (!BASES.some((b) => real.startsWith(join(ROOT_REAL, b) + sep))) return null;
  return stat(real)?.isFile() ? real : null;
};

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
};
const mimeOf = (f: string) => MIME[f.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
const SECURITY = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"};

const serveFile = (abs: string, req: Request) => {
  const file = Bun.file(abs);
  const size = file.size;
  const headers: Record<string, string> = {...SECURITY, "Content-Type": mimeOf(abs), "Accept-Ranges": "bytes", "Cache-Control": "no-cache"};
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) return new Response(null, {status: 416, headers: {...headers, "Content-Range": `bytes */${size}`}});
    const start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || start > end) return new Response(null, {status: 416, headers: {...headers, "Content-Range": `bytes */${size}`}});
    return new Response(req.method === "HEAD" ? null : file.slice(start, end + 1), {
      status: 206,
      headers: {...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1)},
    });
  }
  return new Response(req.method === "HEAD" ? null : file, {status: 200, headers: {...headers, "Content-Length": String(size)}});
};

const UI_ASSETS = new Map<string, {body: ArrayBuffer | Uint8Array; type: string}>();
if (existsSync(join(DIST_UI_DIR, "index.html"))) {
  const walk = (dir: string, prefix = "") => {
    for (const ent of readdirSync(dir, {withFileTypes: true})) {
      const full = join(dir, ent.name);
      const relPath = prefix ? `${prefix}/${ent.name}` : `/${ent.name}`;
      if (ent.isDirectory()) walk(full, relPath);
      else UI_ASSETS.set(relPath, {body: readFileSync(full), type: mimeOf(full)});
    }
  };
  walk(DIST_UI_DIR);
  UI_ASSETS.set("/", UI_ASSETS.get("/index.html")!);
  console.log(`  Studio UI loaded from ${DIST_UI_DIR} (${UI_ASSETS.size - 1} files)`);
} else {
  const {default: tailwind} = await import("bun-plugin-tailwind");
  const built = await Bun.build({
    entrypoints: [join(STUDIO_DIR, "ui", "index.html")],
    plugins: [tailwind],
    minify: true,
    target: "browser",
    sourcemap: "none",
  });
  if (!built.success) {
    console.error("✖ Studio UI failed to build:");
    for (const l of built.logs) console.error(String(l));
    process.exit(1);
  }
  for (const o of built.outputs) {
    const name = o.path.replace(/^\.\//, "");
    UI_ASSETS.set(`/${name}`, {body: await o.arrayBuffer(), type: o.type});
  }
  UI_ASSETS.set("/", UI_ASSETS.get("/index.html")!);
  console.log(`  Studio UI built in memory (${built.outputs.length} files)`);
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {status, headers: {...SECURITY, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}});
const text = (body: string, status: number) =>
  new Response(`${body}\n`, {status, headers: {...SECURITY, "Content-Type": "text/plain; charset=utf-8"}});
const validVideo = (id: string) => ID_RE.test(id) && id !== "gallery" && stat(join(ROOT, "src", "videos", id))?.isDirectory();

const route = async (req: Request, url: URL): Promise<Response> => {
  const path = url.pathname;
  const method = req.method;

  const asset = (method === "GET" || method === "HEAD") && UI_ASSETS.get(path);
  if (asset) {
    return new Response(method === "HEAD" ? null : asset.body, {
      headers: {...SECURITY, "Content-Type": asset.type, "Cache-Control": path === "/" || path.endsWith(".html") ? "no-store" : "no-cache"},
    });
  }

  if (method === "GET" && path === "/api/health") {
    return json({ok: true, workspace: ROOT, port: PORT});
  }

  if (method === "GET" && path === "/api/system") {
    const envMap = loadWorkspaceEnv();
    const configuredKeys: Record<string, boolean> = {};
    for (const k of ENV_KEYS) configuredKeys[k.key] = Boolean(envMap[k.key]?.trim());
    return json({
      workspace: ROOT,
      templateDir: TEMPLATE_DIR,
      tools: {
        bun: Boolean(findTool("bun.exe") ?? process.execPath),
        ffmpeg: Boolean(findTool("ffmpeg.exe")),
        ffprobe: Boolean(findTool("ffprobe.exe")),
        nodeModules: existsSync(join(ROOT, "node_modules")),
      },
      configuredKeys,
      apps: detectAiApps(),
      hasTutorialVideo: Boolean(getTutorialVideoPath()),
    });
  }

  if (method === "GET" && path === "/api/env") {
    const envMap = loadWorkspaceEnv();
    return json({
      keys: ENV_KEYS.map((k) => {
        const val = envMap[k.key]?.trim() ?? "";
        return {
          ...k,
          configured: Boolean(val),
          masked: val ? `${val.slice(0, 4)}${"•".repeat(Math.max(6, Math.min(14, val.length - 8)))}${val.slice(-4)}` : "",
        };
      }),
    });
  }

  if (method === "POST" && path === "/api/env") {
    const body = (await req.json()) as {updates?: Record<string, string>};
    const existing = loadWorkspaceEnv();
    const next: Record<string, string> = {...existing};
    for (const [k, v] of Object.entries(body.updates ?? {})) {
      if (!ENV_KEYS.some((x) => x.key === k)) continue;
      if (v.includes("••••")) continue;
      next[k] = v.trim();
    }
    const lines = [
      "# Shorts Kit Studio — Workspace API Keys",
      "# Được lưu tự động bởi Shorts Kit Studio. Không chia sẻ file này ra ngoài.",
      "",
      ...ENV_KEYS.map((k) => `${k.key}=${next[k.key] ?? ""}`),
      "",
    ];
    writeFileSync(join(ROOT, ".env"), lines.join("\n"), "utf8");
    return json({ok: true});
  }

  if (method === "POST" && path === "/api/env/test-ai33") {
    const envMap = loadWorkspaceEnv();
    if (!envMap.AI33_API_KEY?.trim()) {
      return json({ok: false, message: "Chưa nhập AI33_API_KEY. Hãy dán khóa API rồi lưu trước khi kiểm tra."});
    }
    const r = await runCmd([process.execPath, "run", "ai33", "check"], 15_000);
    const msg = stripAnsi(`${r.stdout}\n${r.stderr}`).trim();
    return json({ok: r.code === 0, message: r.code === 0 ? "Kết nối AI33 thành công! Không tốn credit." : msg || "Không thể kết nối AI33."});
  }

  if (method === "GET" && path === "/api/soul") {
    const tplNar = readJson<{voice?: {engine?: string; voice?: string; tempo?: number}}>(join(ROOT, "src", "videos", "_template", "narration.json"));
    return json({
      engine: tplNar.value?.voice?.engine ?? "ai33",
      voice: tplNar.value?.voice?.voice ?? "vbee_hn_male_minhquan_yt_24k-pre",
      tempo: tplNar.value?.voice?.tempo ?? 1.15,
    });
  }

  if (method === "POST" && path === "/api/soul") {
    const body = (await req.json()) as {engine?: string; voice?: string; tempo?: number};
    const tplPath = join(ROOT, "src", "videos", "_template", "narration.json");
    const raw = readJson<Record<string, any>>(tplPath).value;
    if (!raw) return json({ok: false, message: "Không tìm thấy _template/narration.json"}, 404);
    raw.voice = {
      ...(raw.voice ?? {}),
      engine: body.engine || raw.voice?.engine || "ai33",
      voice: body.voice || raw.voice?.voice || "vbee_hn_male_minhquan_yt_24k-pre",
      tempo: typeof body.tempo === "number" && body.tempo >= 0.8 && body.tempo <= 1.5 ? body.tempo : 1.15,
    };
    writeFileSync(tplPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
    return json({ok: true});
  }

  if (method === "GET" && path === "/api/status") {
    const videos = listVideos().map((id) => {
      const s = videoState(id);
      const st = stat(join(ROOT, "src", "videos", id));
      return {id, kind: s.kind, flow: s.flow, steps: s.steps, next: s.next, created: st ? st.birthtimeMs || st.ctimeMs : 0};
    });
    return json({root: ROOT, at: Date.now(), videos});
  }

  if (method === "GET" && path === "/api/task/status") {
    return json(activeTask);
  }

  if (method === "POST" && path === "/api/task/run") {
    const body = (await req.json()) as {videoId?: string; action?: string};
    const id = body.videoId ?? "";
    const action = body.action ?? "";
    if (!validVideo(id)) return json({ok: false, error: "Video không tồn tại"}, 404);
    try {
      await runTaskSequence(id, action);
      return json({ok: true, task: activeTask});
    } catch (e) {
      return json({ok: false, error: (e as Error).message}, 409);
    }
  }

  if (method === "POST" && path === "/api/system/open-folder") {
    const body = (await req.json().catch(() => ({}))) as {subpath?: string};
    const target = body.subpath ? resolve(ROOT, body.subpath) : ROOT;
    const safeTarget = target.startsWith(ROOT) && existsSync(target) ? target : ROOT;
    Bun.spawn(["explorer.exe", safeTarget], {stdin: "ignore", stdout: "ignore", stderr: "ignore"});
    return json({ok: true, path: safeTarget});
  }

  if (method === "POST" && path === "/api/system/open-remotion") {
    const body = (await req.json().catch(() => ({}))) as {videoId?: string};
    const id = body.videoId ?? "";
    if (!validVideo(id)) return json({ok: false, error: "Video không tồn tại"}, 404);
    const wsEnv = loadWorkspaceEnv();
    Bun.spawn([process.execPath, "run", "dev", id], {cwd: ROOT, env: {...process.env, ...wsEnv}, stdin: "ignore", stdout: "ignore", stderr: "ignore"});
    return json({ok: true});
  }

  if (method === "POST" && path === "/api/system/open-codex") {
    const body = (await req.json().catch(() => ({}))) as {target?: "codex" | "chatgpt"};
    const apps = detectAiApps();
    if (body.target === "chatgpt" && apps.chatgpt) {
      Bun.spawn(["cmd", "/c", "start", "", "chatgpt://"], {stdin: "ignore", stdout: "ignore", stderr: "ignore"});
      return json({ok: true, launched: "chatgpt"});
    }
    if (apps.codex) {
      Bun.spawn(["cmd", "/c", "start", "", "codex://"], {stdin: "ignore", stdout: "ignore", stderr: "ignore"});
      return json({ok: true, launched: "codex"});
    }
    return json({ok: false, message: "Hãy mở Codex hoặc ChatGPT Desktop App từ Start Menu và chọn thư mục dự án."});
  }

  if (method === "POST" && path === "/api/system/sync-template") {
    return json(syncTemplateIntoWorkspace());
  }

  if ((method === "GET" || method === "HEAD") && path === "/api/tutorial-video") {
    const tv = getTutorialVideoPath();
    if (!tv) return text("404 tutorial video not found", 404);
    return serveFile(tv, req);
  }

  let m = /^\/api\/video\/([^/]+)$/.exec(path);
  if (method === "GET" && m) {
    const id = decodeURIComponent(m[1]);
    if (!validVideo(id)) return json({error: `no video "${id}"`}, 404);
    return json(videoState(id));
  }

  m = /^\/api\/lint\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!validVideo(id)) return json({error: `no video "${id}"`}, 404);
    if (method === "GET") return json({lint: lintCache[id] ?? null, running: lintRunning.has(id)});
    if (method !== "POST") return json({error: "method not allowed"}, 405);
    return json({lint: await runLint(id), running: false});
  }

  m = /^\/api\/probe\/([^/]+)$/.exec(path);
  if (method === "GET" && m) {
    const id = decodeURIComponent(m[1]);
    if (!validVideo(id)) return json({error: `no video "${id}"`}, 404);
    const which = url.searchParams.get("file") ?? "upload";
    const name = which === "render" ? `${id}.mp4` : which === "loud" ? `${id}-loud.mp4` : `${id}-upload.mp4`;
    const abs = out(id, name);
    if (!isFile(abs)) return json({probe: null});
    return json({probe: await probe(abs, rel(abs))});
  }

  m = /^\/api\/text\/([^/]+)$/.exec(path);
  if (method === "GET" && m) {
    const id = decodeURIComponent(m[1]);
    if (!validVideo(id)) return json({error: `no video "${id}"`}, 404);
    return json({
      caption: readText(out(id, "caption.txt")),
      pinned: readText(out(id, "pinned.txt")) ?? readText(out(id, "pinned-comment.txt")),
      credits: readText(out(id, "credits.md")),
    });
  }

  if ((method === "GET" || method === "HEAD") && path.startsWith("/file/")) {
    const abs = safePath(path.slice("/file/".length));
    if (!abs) return text("404 not found", 404);
    return serveFile(abs, req);
  }

  return text("404 not found", 404);
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  fetch: (req) => route(req, new URL(req.url)),
  idleTimeout: 120,
});

console.log(`Shorts Kit Studio running at http://127.0.0.1:${server.port} (workspace: ${ROOT})`);

const stop = () => {
  server.stop(true);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
