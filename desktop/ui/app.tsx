import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {
  Check,
  Copy01,
  Folder,
  Play,
  RefreshCw01,
  Settings01,
  Stars01,
  VideoRecorder,
  AlertCircle,
  BookOpen01,
  Eye,
  EyeOff,
} from "@untitledui/icons";
import logoUrl from "../../docs/assets/logo.svg";

type Status = "done" | "todo" | "warn" | "fail" | "unknown";
type Step = {key: string; n: number; label: string; status: Status; detail: string; command: string; skill: string};
type FileInfo = {path: string; size: number; mtime: number} | null;

type VideoSummary = {
  id: string;
  kind: "video";
  flow: string | null;
  steps: Step[];
  next: {key: string; label: string; command: string; skill: string; detail: string};
  created?: number;
};

type VideoDetail = {
  id: string;
  flow: string | null;
  steps: Step[];
  next: {key: string; label: string; command: string; skill: string; detail: string};
  files: {
    render: FileInfo;
    loud: FileInfo;
    upload: FileInfo;
    cover: FileInfo;
    coverJpg: FileInfo;
    caption: FileInfo;
    pinned: FileInfo;
    stills: NonNullable<FileInfo>[];
    voiceJson: FileInfo;
    narrationJson: FileInfo;
    storyboard?: FileInfo;
    brief: FileInfo;
  };
  voice: null | {
    engine: string | null;
    estimated: boolean;
    duration: number | null;
    words: number | null;
    lines: number | null;
    scenes: {id: string; start: number; end: number}[];
    audio: FileInfo;
  };
  lint: {at: number; code: number; errors: number | null; warnings: number | null; output: string; ms: number} | null;
  lintRunning: boolean;
};

type SystemInfo = {
  workspace: string;
  templateDir: string;
  tools: {bun: boolean; ffmpeg: boolean; ffprobe: boolean; nodeModules: boolean};
  configuredKeys: Record<string, boolean>;
  apps: {codex: boolean; chatgpt: boolean};
  hasTutorialVideo: boolean;
};

type EnvKeyRow = {key: string; label: string; required: boolean; hint: string; configured: boolean; masked: string};

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

type ProbeResult = {
  duration: number | null;
  size: number;
  checks: {name: string; ok: boolean; value: string; want: string}[];
};

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, {...init, cache: "no-store"});
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
};

const fileUrl = (f: NonNullable<FileInfo>) =>
  `/file/${f.path.split("/").map(encodeURIComponent).join("/")}?v=${Math.round(f.mtime)}`;

const formatSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

const Badge: React.FC<{tone?: "ok" | "warn" | "err" | "info" | "muted"; children: React.ReactNode}> = ({tone = "muted", children}) => {
  const cls = {
    ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    err: "bg-rose-500/15 text-rose-300 border-rose-500/35",
    info: "bg-sky-500/15 text-sky-300 border-sky-500/35",
    muted: "bg-slate-800 text-slate-300 border-slate-700",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
};

const CopyBtn: React.FC<{text: string; label?: string; primary?: boolean}> = ({text, label = "Sao chép", primary}) => {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={onCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
        copied
          ? "bg-emerald-500 text-slate-950"
          : primary
            ? "bg-sky-400 text-slate-950 hover:bg-sky-300"
            : "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy01 className="h-3.5 w-3.5" />}
      {copied ? "Đã sao chép!" : label}
    </button>
  );
};

// ── Tab 1: Bắt đầu nhanh & Kho Prompt ──────────────────────────────────────
const QuickStartTab: React.FC<{
  sys: SystemInfo | null;
  onGoTab: (t: "start" | "videos" | "settings" | "guide") => void;
  onReload: () => void;
}> = ({sys, onGoTab, onReload}) => {
  const [topic, setTopic] = useState("Vì sao chip AI ngày càng nóng và cần tản nhiệt chất lỏng");
  const [duration, setDuration] = useState("45–55 giây");
  const [appMessage, setAppMessage] = useState<string | null>(null);

  const prompts = useMemo(
    () => [
      {
        title: "1. Tạo video mới hoàn toàn từ chủ đề",
        tag: "Phổ biến nhất",
        desc: "AI tự kiểm chứng thông tin, viết kịch bản, tạo giọng đọc AI33 tiếng Việt và dựng cảnh Remotion.",
        text: `Hãy dùng sk-pipeline để làm cho mình một video TikTok dọc dài khoảng ${duration} về chủ đề: "${topic}".\n- Ngôn ngữ: tiếng Việt, giọng AI33 mặc định trong SOUL.md.\n- Hãy tìm nguồn xác thực trước khi viết lời thoại, kiểm tra vùng an toàn trên khung hình, tạo storyboard cho mình duyệt trước khi dựng cảnh và xuất bản cuối.`,
      },
      {
        title: "2. Dựng video từ clip / ghi âm tự quay sẵn",
        tag: "Talking-head / Voice",
        desc: "Kéo thả file .mp4/.mov/.mp3 vào khung chat rồi dán prompt này để AI tự cắt khoảng lặng & thêm chữ.",
        text: `Hãy dùng sk-pipeline (luồng recorded voice) để dựng video dọc từ file mình vừa gửi.\n- Tự cắt bỏ các đoạn ậm ờ, lặp lại và khoảng lặng dài.\n- Giữ đúng nội dung mình nói, kiểm chứng các số liệu được nhắc đến, thêm phụ đề và hiệu ứng kinetic phù hợp.`,
      },
      {
        title: "3. Sửa lời thoại, cách đọc hoặc chữ bị che",
        tag: "Chỉnh sửa",
        desc: "Dùng khi muốn AI sửa lại một câu thoại, thêm phiên âm từ tiếng Anh hoặc chỉnh bố cục khung hình.",
        text: `Hãy mở video [điền tên thư mục video] và chỉnh sửa giúp mình:\n- Sửa câu thoại ở cảnh [...] thành: [...]\n- Nếu có từ tiếng Anh đọc chưa chuẩn, thêm vào mục pronounce trong narration.json rồi chạy lại TTS.\n- Chạy lại lint và xuất ảnh still --safe để kiểm tra không bị che chữ.`,
      },
      {
        title: "4. Kiểm tra và hoàn thiện trước khi xuất",
        tag: "Hoàn tất",
        desc: "Chạy rà soát cuối trước khi bạn bấm nút Xuất video hoàn chỉnh ngay trên Shorts Kit Studio.",
        text: `Hãy kiểm tra lại toàn bộ video [điền tên video]: chạy bun run facts, bun run lint, bun run check và tạo đủ caption.txt kèm pinned.txt trong thư mục out/.`,
      },
    ],
    [topic, duration]
  );

  const openFolder = async () => {
    await api("/api/system/open-folder", {method: "POST", body: JSON.stringify({})});
  };
  const openAiApp = async (target: "codex" | "chatgpt") => {
    try {
      const res = await api<{ok: boolean; message?: string}>("/api/system/open-codex", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({target}),
      });
      if (!res.ok && res.message) setAppMessage(res.message);
    } catch (e) {
      setAppMessage((e as Error).message);
    }
  };

  const hasAi33 = Boolean(sys?.configuredKeys?.AI33_API_KEY);
  const toolsOk = Boolean(sys?.tools?.bun && sys?.tools?.ffmpeg && sys?.tools?.nodeModules);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        {/* 4-Step Setup Checklist */}
        <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Bắt đầu trong 4 bước (Không cần gõ lệnh)</h2>
              <p className="text-sm text-slate-400">Hoàn tất danh sách dưới đây một lần, sau đó chỉ cần giao việc cho AI.</p>
            </div>
            <button onClick={onReload} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer">
              <RefreshCw01 className="h-3.5 w-3.5" /> Làm mới
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
              <div>
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span>1. Bộ công cụ nền (Bun, FFmpeg, Remotion)</span>
                  <Badge tone={toolsOk ? "ok" : "warn"}>{toolsOk ? "Đã sẵn sàng" : "Thiếu thành phần"}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">Đã cài sẵn tự động theo bộ cài Windows.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
              <div>
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span>2. Khóa API giọng đọc & tìm kiếm</span>
                  <Badge tone={hasAi33 ? "ok" : "warn"}>{hasAi33 ? "Đã cấu hình AI33" : "Cần nhập AI33_API_KEY"}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">Dán API key trực tiếp trên màn hình, không cần sửa file ẩn.</p>
              </div>
              <button onClick={() => onGoTab("settings")} className="rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-300 cursor-pointer">
                {hasAi33 ? "Xem Cài đặt" : "Nhập API Key ngay"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <span>3. Mở thư mục dự án trong Codex / ChatGPT Desktop App</span>
                    <Badge tone="info">Quan trọng</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-amber-300">{sys?.workspace ?? "Documents\\ShortsKit"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyBtn text={sys?.workspace ?? ""} label="Copy đường dẫn" />
                  <button onClick={openFolder} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer">
                    <Folder className="h-3.5 w-3.5" /> Mở thư mục
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => openAiApp("codex")} className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 cursor-pointer">
                  Mở Codex App
                </button>
                <button onClick={() => openAiApp("chatgpt")} className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer">
                  Mở ChatGPT App
                </button>
                <button onClick={() => onGoTab("guide")} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer">
                  Xem cách chọn thư mục →
                </button>
              </div>
              {appMessage && <p className="mt-2 text-xs text-amber-300">{appMessage}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
              <div>
                <div className="font-semibold text-white">4. Dán Prompt mẫu → Chờ AI dựng → Bấm Xuất MP4</div>
                <p className="mt-0.5 text-xs text-slate-400">Sau khi AI báo xong, sang tab Quản lý Video bấm 1 nút để xuất file.</p>
              </div>
              <button onClick={() => onGoTab("videos")} className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer">
                Vào Quản lý Video
              </button>
            </div>
          </div>
        </section>

        {/* Prompt Library */}
        <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-5 shadow-lg">
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Stars01 className="h-5 w-5 text-sky-400" /> Kho Prompt Mẫu (1-Click Sao Chép)
            </h2>
            <p className="text-sm text-slate-400">Điền chủ đề muốn làm bên dưới, rồi bấm Sao chép và dán vào Codex / ChatGPT Desktop App.</p>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-300">Chủ đề video muốn làm</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                placeholder="Nhập chủ đề bất kỳ..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">Thời lượng mục tiêu</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
              >
                <option value="35–45 giây">35–45 giây (Nhanh)</option>
                <option value="45–55 giây">45–55 giây (Chuẩn TikTok)</option>
                <option value="60–75 giây">60–75 giây (Giải thích sâu)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {prompts.map((p) => (
              <div key={p.title} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{p.title}</span>
                      <Badge tone="info">{p.tag}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{p.desc}</p>
                  </div>
                  <CopyBtn text={p.text} label="Sao chép Prompt" primary />
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[#070B12] p-3 font-mono text-xs text-slate-300 border border-slate-800/80">
                  {p.text}
                </pre>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Right Column: Embedded Kinetic Tutorial Video */}
      <div className="space-y-6 lg:col-span-5">
        <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-5 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Video Kinetic Hướng Dẫn (55s)</h2>
              <p className="text-xs text-slate-400">Video này được tạo trực tiếp bằng chính Shorts Kit.</p>
            </div>
            <Badge tone="ok">HD 1080×1920</Badge>
          </div>
          {sys?.hasTutorialVideo ? (
            <div className="flex justify-center rounded-2xl bg-[#070B12] p-3 border border-slate-800">
              <video
                src="/api/tutorial-video"
                controls
                playsInline
                className="max-h-[560px] w-auto rounded-xl shadow-2xl"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
              Chưa tìm thấy video hướng dẫn. Hãy render <code>huong-dan-shorts-kit</code>.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ── Tab 2: Quản lý Video & Xuất 1-Click ────────────────────────────────────
const VideosTab: React.FC = () => {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [texts, setTexts] = useState<{caption: string | null; pinned: string | null; credits: string | null} | null>(null);
  const [task, setTask] = useState<TaskState | null>(null);
  const [subTab, setSubTab] = useState<"preview" | "script" | "stills" | "handoff">("preview");
  const [filter, setFilter] = useState<"all" | "ready" | "wip">("all");
  const [search, setSearch] = useState("");
  const [taskMsg, setTaskMsg] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const res = await api<{videos: VideoSummary[]}>("/api/status");
    setVideos(res.videos);
    setSelectedId((prev) => (prev && res.videos.some((v) => v.id === prev) ? prev : res.videos[0]?.id ?? null));
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const [d, p, t] = await Promise.all([
      api<VideoDetail>(`/api/video/${encodeURIComponent(id)}`),
      api<{probe: ProbeResult | null}>(`/api/probe/${encodeURIComponent(id)}?file=upload`),
      api<{caption: string | null; pinned: string | null; credits: string | null}>(`/api/text/${encodeURIComponent(id)}`),
    ]);
    setDetail(d);
    setProbe(p.probe);
    setTexts(t);
  }, []);

  const pollTask = useCallback(async () => {
    const t = await api<TaskState>("/api/task/status");
    setTask(t);
    return t;
  }, []);

  useEffect(() => {
    loadList();
    pollTask();
    const timer = setInterval(() => {
      loadList();
      pollTask();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadList, pollTask]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail, task?.status]);

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (search && !v.id.toLowerCase().includes(search.toLowerCase())) return false;
      const done = v.steps.filter((s) => s.status === "done").length;
      if (filter === "ready") return done === v.steps.length;
      if (filter === "wip") return done < v.steps.length;
      return true;
    });
  }, [videos, filter, search]);

  const triggerAction = async (action: string) => {
    if (!selectedId) return;
    setTaskMsg(null);
    try {
      await api("/api/task/run", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({videoId: selectedId, action}),
      });
      await pollTask();
    } catch (e) {
      setTaskMsg((e as Error).message);
    }
  };

  const openOutFolder = async () => {
    if (!selectedId) return;
    await api("/api/system/open-folder", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({subpath: `out/${selectedId}`}),
    });
  };

  const openRemotion = async () => {
    if (!selectedId) return;
    await api("/api/system/open-remotion", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({videoId: selectedId}),
    });
    setTaskMsg("Đang mở Remotion Studio trên trình duyệt...");
  };

  const runningForCurrent = task?.status === "running";
  const activeVideoFile = detail?.files.upload ?? detail?.files.loud ?? detail?.files.render;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Sidebar: Video list */}
      <div className="space-y-3 lg:col-span-4">
        <div className="rounded-2xl border border-slate-800 bg-[#0D1420] p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên video..."
            className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
          />
          <div className="mb-3 flex gap-1.5">
            {([
              ["all", "Tất cả"],
              ["wip", "Đang làm"],
              ["ready", "Xong hết"],
            ] as const).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold cursor-pointer ${
                  filter === k ? "bg-sky-400 text-slate-950" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="max-h-[580px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((v) => {
              const done = v.steps.filter((s) => s.status === "done").length;
              const pct = Math.round((done / v.steps.length) * 100);
              const active = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`w-full rounded-xl border p-3 text-left transition cursor-pointer ${
                    active ? "border-sky-400 bg-sky-500/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-white">{v.id}</span>
                    <Badge tone={pct === 100 ? "ok" : "info"}>{done}/{v.steps.length}</Badge>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-sky-400" style={{width: `${pct}%`}} />
                  </div>
                  <div className="mt-1.5 truncate text-xs text-slate-400">Tiếp theo: {v.next.label}</div>
                </button>
              );
            })}
            {!filtered.length && <p className="py-6 text-center text-xs text-slate-500">Không có video nào khớp.</p>}
          </div>
        </div>
      </div>

      {/* Right Panel: Selected video details */}
      <div className="space-y-5 lg:col-span-8">
        {detail ? (
          <>
            {/* 1-Click Action Bar */}
            <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">{detail.id}</h2>
                  <p className="text-xs text-slate-400">Flow {detail.flow ?? "?"} · Trạng thái kế tiếp: <span className="text-sky-300 font-semibold">{detail.next.label}</span></p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={runningForCurrent}
                    onClick={() => triggerAction("lint")}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    Kiểm tra lỗi
                  </button>
                  <button
                    disabled={runningForCurrent}
                    onClick={() => triggerAction("tts")}
                    className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    Tạo giọng AI (TTS)
                  </button>
                  <button
                    disabled={runningForCurrent}
                    onClick={() => triggerAction("publish_all")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-300 disabled:opacity-50 cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5" /> Xuất video hoàn chỉnh
                  </button>
                  <button
                    onClick={openOutFolder}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 cursor-pointer"
                  >
                    <Folder className="h-3.5 w-3.5" /> Mở thư mục xuất
                  </button>
                  <button
                    onClick={openRemotion}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Remotion Studio
                  </button>
                </div>
              </div>

              {taskMsg && <div className="mt-3 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">{taskMsg}</div>}

              {task && task.status !== "idle" && (task.videoId === detail.id || task.status === "running") && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-[#070B12] p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Badge tone={task.status === "running" ? "info" : task.status === "done" ? "ok" : "err"}>
                        {task.status === "running" ? "Đang chạy..." : task.status === "done" ? "Hoàn thành" : "Có lỗi"}
                      </Badge>
                      <span className="text-slate-200">{task.currentStep}</span>
                    </div>
                    <span className="text-xs text-slate-500">{task.videoId}</span>
                  </div>
                  <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-slate-400">
                    {task.logs.slice(-20).join("\n")}
                  </pre>
                </div>
              )}

              {/* 12 Steps grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {detail.steps.map((s) => (
                  <div key={s.key} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-slate-200">{s.n}. {s.label}</span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          s.status === "done" ? "bg-emerald-400" : s.status === "warn" ? "bg-amber-400" : s.status === "fail" ? "bg-rose-400" : "bg-slate-600"
                        }`}
                      />
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-400" title={s.detail}>{s.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Sub-tabs */}
            <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-5">
              <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
                {([
                  ["preview", "Xem Video & Chất lượng"],
                  ["script", "Kịch bản & Giọng đọc"],
                  ["stills", `Ảnh kiểm tra (${detail.files.stills.length})`],
                  ["handoff", "Ảnh bìa & Caption"],
                ] as const).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setSubTab(k)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      subTab === k ? "bg-sky-400 text-slate-950" : "bg-slate-900 text-slate-300 hover:text-white"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {subTab === "preview" && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="flex justify-center rounded-xl bg-[#070B12] p-3 border border-slate-800">
                    {activeVideoFile ? (
                      <video key={activeVideoFile.path} src={fileUrl(activeVideoFile)} controls playsInline className="max-h-[460px] rounded-lg" />
                    ) : (
                      <div className="py-16 text-center text-sm text-slate-500">Chưa render file MP4. Hãy bấm "Xuất video hoàn chỉnh".</div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-white">Kiểm tra thông số file đăng bài</h3>
                    {probe ? (
                      <div className="space-y-2">
                        {probe.checks.map((c) => (
                          <div key={c.name} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
                            <span className="text-slate-300">{c.name}</span>
                            <Badge tone={c.ok ? "ok" : "err"}>{c.value}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Chưa có file <code>-upload.mp4</code> để kiểm tra thông số.</p>
                    )}
                    {detail.lint && (
                      <div className="mt-4">
                        <h4 className="mb-1.5 text-xs font-bold text-slate-300">Kết quả Lint gần nhất</h4>
                        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#070B12] p-3 font-mono text-[11px] text-slate-300 border border-slate-800">
                          {detail.lint.output}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {subTab === "script" && (
                <div className="space-y-4">
                  {detail.voice?.audio && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="mb-2 text-xs font-semibold text-slate-300">Nghe lại giọng đọc ({detail.voice.engine}, {detail.voice.duration?.toFixed(1)}s)</div>
                      <audio controls src={fileUrl(detail.voice.audio)} className="w-full" />
                    </div>
                  )}
                  <ScriptLines file={detail.files.narrationJson} />
                </div>
              )}

              {subTab === "stills" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detail.files.stills.map((st) => (
                    <a key={st.path} href={fileUrl(st)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                      <img src={fileUrl(st)} alt={st.path} className="w-full" />
                      <div className="px-2 py-1.5 text-center font-mono text-[11px] text-slate-400">{st.path.split("/").pop()}</div>
                    </a>
                  ))}
                  {!detail.files.stills.length && <p className="col-span-full py-8 text-center text-sm text-slate-500">Chưa có ảnh kiểm tra (still).</p>}
                </div>
              )}

              {subTab === "handoff" && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-bold text-white">Ảnh bìa (Cover)</h3>
                    {detail.files.cover ? (
                      <img src={fileUrl(detail.files.cover)} alt="Cover" className="max-h-[420px] rounded-xl border border-slate-800" />
                    ) : (
                      <p className="text-xs text-slate-500">Chưa xuất ảnh bìa.</p>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-bold text-white">Caption đăng bài</span>
                        {texts?.caption && <CopyBtn text={texts.caption} />}
                      </div>
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-[#070B12] p-3 text-xs text-slate-200">
                        {texts?.caption ?? "Chưa có caption.txt"}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-bold text-white">Bình luận ghim</span>
                        {texts?.pinned && <CopyBtn text={texts.pinned} />}
                      </div>
                      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-[#070B12] p-3 text-xs text-slate-200">
                        {texts?.pinned ?? "Chưa có pinned.txt"}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-[#0D1420] p-12 text-center text-slate-400">
            Chọn một video ở danh sách bên trái để xem chi tiết hoặc xuất file.
          </div>
        )}
      </div>
    </div>
  );
};

const ScriptLines: React.FC<{file: FileInfo}> = ({file}) => {
  const [nar, setNar] = useState<{scenes?: {id: string; lines?: {text: string; fact?: string}[]}[]} | null>(null);
  useEffect(() => {
    if (!file) return setNar(null);
    fetch(fileUrl(file)).then((r) => r.json()).then(setNar).catch(() => setNar(null));
  }, [file]);
  if (!nar) return <p className="text-xs text-slate-500">Chưa có narration.json.</p>;
  return (
    <div className="space-y-3">
      {(nar.scenes ?? []).map((sc) => (
        <div key={sc.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-sky-400">{sc.id}</div>
          <div className="space-y-1.5">
            {(sc.lines ?? []).map((l, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 text-sm text-slate-200">
                <span>{l.text}</span>
                {l.fact && <Badge tone="muted">{l.fact}</Badge>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Tab 3: Cài đặt & API Key ────────────────────────────────────────────────
const SettingsTab: React.FC<{sys: SystemInfo | null; onSaved: () => void}> = ({sys, onSaved}) => {
  const [keys, setKeys] = useState<EnvKeyRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [ai33Status, setAi33Status] = useState<{ok: boolean; message: string} | null>(null);
  const [testing, setTesting] = useState(false);

  const [voice, setVoice] = useState("vbee_hn_male_minhquan_yt_24k-pre");
  const [tempo, setTempo] = useState("1.15");

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([
      api<{keys: EnvKeyRow[]}>("/api/env"),
      api<{engine: string; voice: string; tempo: number}>("/api/soul"),
    ]);
    setKeys(e.keys);
    const initVals: Record<string, string> = {};
    for (const k of e.keys) initVals[k.key] = k.masked;
    setValues(initVals);
    setVoice(s.voice);
    setTempo(String(s.tempo));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveEnv = async () => {
    setStatusMsg(null);
    await api("/api/env", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({updates: values}),
    });
    setStatusMsg("✅ Đã lưu các khóa API vào file .env của thư mục dự án!");
    await load();
    onSaved();
  };

  const testAi33 = async () => {
    setTesting(true);
    setAi33Status(null);
    try {
      const res = await api<{ok: boolean; message: string}>("/api/env/test-ai33", {method: "POST"});
      setAi33Status(res);
    } finally {
      setTesting(false);
    }
  };

  const saveVoiceDefaults = async () => {
    await api("/api/soul", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({engine: "ai33", voice, tempo: Number(tempo) || 1.15}),
    });
    setStatusMsg("✅ Đã lưu giọng đọc & tốc độ mặc định cho các video mới!");
  };

  const syncTemplate = async () => {
    const r = await api<{message: string}>("/api/system/sync-template", {method: "POST"});
    setStatusMsg(r.message);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-6 lg:col-span-7">
        <h2 className="text-lg font-bold text-white">Khóa API (.env) — Nhập trực quan</h2>
        <p className="mt-1 text-sm text-slate-400">Dán key của bạn vào ô tương ứng rồi bấm Lưu. Để trống hoặc giữ nguyên dấu • nếu không đổi.</p>

        <div className="mt-5 space-y-4">
          {keys.map((k) => (
            <div key={k.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-white">
                  {k.label} {k.required && <span className="text-rose-400">*</span>}
                </label>
                <Badge tone={k.configured ? "ok" : k.required ? "warn" : "muted"}>
                  {k.configured ? "Đã nhập" : k.required ? "Cần nhập" : "Tùy chọn"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{k.hint}</p>
              <div className="mt-2 flex gap-2">
                <input
                  type={show[k.key] ? "text" : "password"}
                  value={values[k.key] ?? ""}
                  onFocus={() => {
                    if ((values[k.key] ?? "").includes("••••")) setValues((v) => ({...v, [k.key]: ""}));
                  }}
                  onChange={(e) => setValues((v) => ({...v, [k.key]: e.target.value}))}
                  placeholder={`Dán ${k.key} vào đây...`}
                  className="flex-1 rounded-lg border border-slate-700 bg-[#070B12] px-3 py-2 font-mono text-xs text-white focus:border-sky-400 focus:outline-none"
                />
                <button
                  onClick={() => setShow((s) => ({...s, [k.key]: !s[k.key]}))}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-slate-300 hover:text-white cursor-pointer"
                  title="Hiện / Ẩn"
                >
                  {show[k.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={saveEnv} className="rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-sky-300 cursor-pointer">
            Lưu toàn bộ API Key
          </button>
          <button
            disabled={testing}
            onClick={testAi33}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
          >
            {testing ? "Đang kiểm tra..." : "Kiểm tra kết nối AI33"}
          </button>
        </div>

        {statusMsg && <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-200">{statusMsg}</div>}
        {ai33Status && (
          <div className={`mt-3 rounded-xl border p-3 text-sm ${ai33Status.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
            {ai33Status.message}
          </div>
        )}
      </section>

      <div className="space-y-6 lg:col-span-5">
        <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-6">
          <h2 className="text-lg font-bold text-white">Giọng đọc mặc định (Template)</h2>
          <p className="mt-1 text-xs text-slate-400">Áp dụng cho mọi video mới được AI khởi tạo.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">Mã giọng AI33 (Voice ID)</label>
              <input
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B12] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">Tốc độ đọc (khuyên dùng 1.1 – 1.25)</label>
              <input
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B12] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <button onClick={saveVoiceDefaults} className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 cursor-pointer">
              Lưu giọng mặc định
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-6">
          <h2 className="text-lg font-bold text-white">Thư mục dự án & Đồng bộ</h2>
          <p className="mt-1 font-mono text-xs text-amber-300 break-all">{sys?.workspace}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={syncTemplate} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer">
              Đồng bộ lại Skills & Template
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Không ghi đè API key hay video bạn đã làm.</p>
        </section>
      </div>
    </div>
  );
};

// ── Tab 4: Hướng dẫn chi tiết Codex & ChatGPT Desktop App ──────────────────
const GuideTab: React.FC<{sys: SystemInfo | null}> = ({sys}) => (
  <div className="space-y-6">
    <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-6">
      <h2 className="text-xl font-bold text-white">Hướng dẫn kết nối với Codex Desktop App / ChatGPT Desktop App</h2>
      <p className="mt-1 text-sm text-slate-400">
        Shorts Kit hoạt động thông qua AI Agent đọc bộ quy tắc trong thư mục dự án. Bạn không cần học lập trình — chỉ cần trỏ đúng thư mục dưới đây.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-sky-300">Đường dẫn thư mục dự án cần chọn</div>
          <div className="mt-1 font-mono text-sm font-bold text-amber-300">{sys?.workspace ?? "Documents\\ShortsKit"}</div>
        </div>
        <CopyBtn text={sys?.workspace ?? ""} label="Sao chép đường dẫn" primary />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="text-base font-bold text-sky-300">Cách 1: Dùng với Codex Desktop App</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Mở ứng dụng <strong>Codex</strong> trên Windows.</li>
            <li>Ở thanh bên trái hoặc nút tạo dự án mới, chọn <strong>Add Project / Open Folder</strong>.</li>
            <li>Dán hoặc chọn thư mục <code className="text-amber-300">{sys?.workspace}</code>.</li>
            <li>Codex sẽ tự động đọc <code>AGENTS.md</code>, <code>SOUL.md</code> và 9 kỹ năng <code>sk-pipeline</code>.</li>
            <li>Quay lại tab <strong>Bắt đầu nhanh</strong> của phần mềm này, bấm <strong>Sao chép Prompt</strong> rồi dán vào Codex và nhấn Enter.</li>
          </ol>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="text-base font-bold text-emerald-300">Cách 2: Dùng với ChatGPT Desktop App (Chế độ Work)</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Mở ứng dụng <strong>ChatGPT</strong> trên Windows và chuyển sang chế độ <strong>Work / Local Workspace</strong> (hoặc liên kết thư mục Codex).</li>
            <li>Chọn thư mục làm việc là <code className="text-amber-300">{sys?.workspace}</code>.</li>
            <li>Dán Prompt mẫu từ tab <strong>Bắt đầu nhanh</strong> kèm chủ đề hoặc đính kèm clip tự quay của bạn.</li>
            <li>Khi AI hỏi duyệt <strong>Storyboard</strong> (danh sách cảnh), bạn xem lại câu chữ rồi nhắn "OK, dựng tiếp đi".</li>
            <li>Khi AI báo xong, quay lại tab <strong>Quản lý Video</strong> bấm <strong>Xuất video hoàn chỉnh</strong>.</li>
          </ol>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-800 bg-[#0D1420] p-6">
      <h3 className="text-base font-bold text-white">Xử lý nhanh các tình huống thường gặp</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {[
          ["Giọng AI đọc sai từ tiếng Anh / tên riêng", "Nhắn cho Codex/ChatGPT: 'Thêm cách đọc tiếng Việt cho từ X vào mục pronounce rồi chạy lại TTS'."],
          ["Chữ bị nút Like/Caption của TikTok che mất", "Nhắn cho AI: 'Chạy still --safe và đẩy chữ vào trong vùng an toàn giữa màn hình'."],
          ["Muốn thay ảnh hoặc đổi nhạc nền khác", "Kéo ảnh/nhạc mới vào khung chat và nhắn: 'Thay ảnh cảnh 2 bằng ảnh này' hoặc 'Đổi nhạc nền nhẹ hơn'."],
          ["Báo thiếu API Key AI33 hoặc lỗi kết nối", "Vào tab Cài đặt & API Key của phần mềm, dán lại AI33_API_KEY, bấm Lưu rồi bấm Kiểm tra kết nối."],
        ].map(([q, a]) => (
          <div key={q} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="font-semibold text-amber-300 text-sm">{q}</div>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
    </section>
  </div>
);

// ── Main Shell ────────────────────────────────────────────────────────────
const App = () => {
  const [tab, setTab] = useState<"start" | "videos" | "settings" | "guide">("start");
  const [sys, setSys] = useState<SystemInfo | null>(null);

  const loadSys = useCallback(async () => {
    try {
      const s = await api<SystemInfo>("/api/system");
      setSys(s);
    } catch {}
  }, []);

  useEffect(() => {
    loadSys();
  }, [loadSys]);

  const navItems: {id: typeof tab; label: string; icon: React.ReactNode}[] = [
    {id: "start", label: "Bắt đầu & Prompt", icon: <Stars01 className="h-4 w-4" />},
    {id: "videos", label: "Quản lý Video", icon: <VideoRecorder className="h-4 w-4" />},
    {id: "settings", label: "Cài đặt & API Key", icon: <Settings01 className="h-4 w-4" />},
    {id: "guide", label: "Hướng dẫn Codex/ChatGPT", icon: <BookOpen01 className="h-4 w-4" />},
  ];

  const ready = Boolean(sys?.tools.bun && sys?.tools.ffmpeg && sys?.configuredKeys?.AI33_API_KEY);

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#090F1A]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Shorts Kit" className="h-9 w-9 rounded-lg" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">Shorts Kit Studio</h1>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">v0.1.0</span>
              </div>
              <div className="text-xs text-slate-400">Công cụ tạo video ngắn AI cho phòng ban</div>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1.5">
            {navItems.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                  tab === n.id
                    ? "bg-sky-400 text-slate-950 shadow-sm"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Badge tone={ready ? "ok" : "warn"}>
              {ready ? "Hệ thống sẵn sàng" : "Cần nhập AI33 API Key"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6">
        {tab === "start" && <QuickStartTab sys={sys} onGoTab={setTab} onReload={loadSys} />}
        {tab === "videos" && <VideosTab />}
        {tab === "settings" && <SettingsTab sys={sys} onSaved={loadSys} />}
        {tab === "guide" && <GuideTab sys={sys} />}
      </main>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
