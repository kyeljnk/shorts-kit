import {createHash, randomUUID} from "node:crypto";
import {mkdir, readFile, rename, unlink, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";

const HOST = "https://generativelanguage.googleapis.com";
const API = HOST + "/v1beta";
const REVISION = "2026-05-20";
const POLL_MS = 5_000;

export const MODEL = "gemini-4-argon";
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

type VideoInput = {type: "video"; uri: string; mime_type: string; processing: "agentic"};
type TextInput = {type: "text"; text: string};
export type GeminiInput = TextInput | VideoInput;

type RemoteFile = {
  name: string;
  uri: string;
  mimeType: string;
  state?: string;
  expirationTime?: string;
};

type Interaction = {
  id: string;
  status: string;
  model?: string;
  steps?: Array<{type: string; content?: Array<{type: string; text?: string}>}>;
  usage?: Record<string, number>;
  error?: {message?: string};
};

export type GeminiResult = {
  id: string;
  text: string;
  processingCalls: number;
  processingResults: number;
  usage?: Record<string, number>;
};

type Receipt =
  | {state: "submitting"}
  | {state: "submitted"; id: string}
  | {state: "completed"; result: GeminiResult};

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), {recursive: true});
  const temp = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temp, contents);
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}

class GeminiHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class GeminiVideoApi {
  constructor(private readonly key: string, private readonly cache: string) {}

  async check(): Promise<void> {
    await this.request("model lookup", API + "/models/" + MODEL);
  }

  private async request(label: string, url: string, init: RequestInit = {}, signedUpload = false) {
    const headers = new Headers(init.headers);
    if (!signedUpload) headers.set("x-goog-api-key", this.key);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init, headers, redirect: "error",
        signal: AbortSignal.timeout(signedUpload ? 10 * 60_000 : 60_000),
      });
    } catch (error) {
      const detail = signedUpload ? "upload connection failed" : error instanceof Error ? error.message.split("\n")[0] : "network error";
      throw new Error(label + " could not reach the Gemini API: " + detail.replaceAll(this.key, "[redacted]"));
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as {error?: {message?: string}};
      const detail = signedUpload ? response.statusText : body.error?.message?.replaceAll(this.key, "[redacted]") ?? response.statusText;
      throw new GeminiHttpError(response.status, label + " returned HTTP " + response.status + ": " + detail);
    }
    return response;
  }

  async video(path: string, identity: string, displayName: string): Promise<VideoInput> {
    const receipt = join(this.cache, "uploads", identity + ".json");
    let file = await readJson<RemoteFile>(receipt);
    if (!file || !file.expirationTime || Date.parse(file.expirationTime) < Date.now() + 300_000) {
      const blob = Bun.file(path);
      const start = await this.request("starting upload for " + displayName, HOST + "/upload/v1beta/files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-upload-protocol": "resumable",
          "x-goog-upload-command": "start",
          "x-goog-upload-header-content-length": String(blob.size),
          "x-goog-upload-header-content-type": "video/mp4",
        },
        body: JSON.stringify({file: {display_name: displayName}}),
      });
      const uploadUrl = new URL(start.headers.get("x-goog-upload-url") ?? "");
      if (uploadUrl.protocol !== "https:" || uploadUrl.hostname !== new URL(HOST).hostname) {
        throw new Error("Gemini returned an unexpected resumable upload host.");
      }
      const upload = await this.request("uploading " + displayName, uploadUrl.href, {
        method: "POST",
        headers: {"content-length": String(blob.size), "x-goog-upload-offset": "0", "x-goog-upload-command": "upload, finalize"},
        body: blob,
      }, true);
      file = ((await upload.json()) as {file: RemoteFile}).file;
      if (!file?.name || !file.uri) throw new Error("Gemini did not return a file receipt for " + displayName);
      await writeAtomic(receipt, JSON.stringify(file));
    }
    const deadline = Date.now() + 10 * 60_000;
    while (file.state !== "ACTIVE") {
      if (file.state === "FAILED") throw new Error("Gemini could not process " + displayName);
      if (Date.now() >= deadline) throw new Error("Gemini is still processing " + displayName + ". Rerun to resume.");
      await Bun.sleep(POLL_MS);
      file = await (await this.request("checking " + displayName, API + "/" + file.name)).json() as RemoteFile;
    }
    await writeAtomic(receipt, JSON.stringify(file));
    return {type: "video", uri: file.uri, mime_type: "video/mp4", processing: "agentic"};
  }

  async analyze(
    label: string, identity: string, hasVideo: boolean, buildInput: () => Promise<GeminiInput[]>,
  ): Promise<GeminiResult> {
    const path = join(this.cache, "interactions", label + "-" + identity + ".json");
    const prior = await readJson<Receipt>(path);
    if (prior?.state === "completed") return prior.result;
    if (prior?.state === "submitting") {
      throw new Error("Submission outcome is unknown for " + label + ". Review the Gemini dashboard before clearing " + path);
    }
    const headers = {"content-type": "application/json", "api-revision": REVISION};
    let id = prior?.id;
    let interaction: Interaction | undefined;
    if (!id) {
      const input = await buildInput();
      await mkdir(dirname(path), {recursive: true});
      await writeFile(path, JSON.stringify({state: "submitting"} satisfies Receipt), {flag: "wx"});
      try {
        interaction = await (await this.request(label, API + "/interactions", {
          method: "POST", headers,
          body: JSON.stringify({model: MODEL, input, background: true, store: true}),
        })).json() as Interaction;
      } catch (error) {
        if (error instanceof GeminiHttpError && [400, 401, 403, 404, 413, 422, 429].includes(error.status)) {
          await unlink(path);
        }
        throw error;
      }
      id = interaction.id;
      if (!id) throw new Error("Gemini did not return an interaction ID for " + label);
      await writeAtomic(path, JSON.stringify({state: "submitted", id} satisfies Receipt));
    }
    const deadline = Date.now() + 20 * 60_000;
    while (interaction?.status !== "completed") {
      if (interaction && ["failed", "cancelled", "canceled", "incomplete", "requires_action"].includes(interaction.status)) {
        throw new Error(label + " ended as " + interaction.status + " (" + id + "). " + (interaction.error?.message ?? ""));
      }
      if (Date.now() >= deadline) throw new Error(label + " is still running (" + id + "). Rerun to resume.");
      if (interaction) await Bun.sleep(POLL_MS);
      interaction = await (await this.request(label + " status", API + "/interactions/" + encodeURIComponent(id), {headers})).json() as Interaction;
    }
    if (interaction.model && interaction.model !== MODEL) throw new Error("Unexpected model: " + interaction.model);
    const steps = interaction.steps ?? [];
    const text = steps.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
    if (!text) throw new Error(label + " returned no text (" + id + ")");
    const result: GeminiResult = {
      id, text, usage: interaction.usage,
      processingCalls: steps.filter((step) => step.type === "processing_call").length,
      processingResults: steps.filter((step) => step.type === "processing_result").length,
    };
    await writeAtomic(path, JSON.stringify({state: "completed", result} satisfies Receipt));
    if (hasVideo && (!result.processingCalls || !result.processingResults)) {
      console.warn(label + " requested Agentic, but Gemini returned no processing call/result pair.");
    }
    return result;
  }
}
