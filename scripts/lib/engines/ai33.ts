import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import type {Engine} from "./types";

const API = "https://api.openspeaker.ai";
const WAIT_MS = 3000;
const TIMEOUT_MS = 15 * 60_000;

type Receipt = {state: "submitting" | "submitted"; taskId?: string};
type Task = {status?: string; error_message?: string; credit_cost?: number; metadata?: {audio_url?: string}};

function requestAI33(path: string, options?: RequestInit): Promise<Response> {
  const key = process.env.AI33_API_KEY?.trim();
  if (!key) throw new Error("AI33_API_KEY is not set in .env");
  const headers = new Headers(options?.headers);
  headers.set("xi-api-key", key);
  return fetch(`${API}${path}`, {...options, headers, redirect: "error"});
}

export async function checkAI33(): Promise<void> {
  let response: Response;
  try {
    response = await requestAI33("/v1/credits", {signal: AbortSignal.timeout(10_000)});
  } catch (error) {
    const code = (error as {code?: string}).code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      throw new Error(`DNS lookup failed for ${new URL(API).hostname} (${code}); no TTS request was submitted by this check.`, {cause: error});
    }
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`AI33 credits check returned HTTP ${response.status}; verify the key and API access in your account.`);
  }
  if (!response.ok) throw new Error(`AI33 credits check returned HTTP ${response.status}.`);
  const credits: unknown = await response.json();
  if (!credits || typeof credits !== "object" || ("success" in credits && credits.success === false)) {
    throw new Error("AI33 returned no valid credit balance response.");
  }
}

export const ai33: Engine = {
  name: "ai33",
  defaultVoice: "vbee_hn_male_minhquan_yt_24k-pre",
  synth: async (lines, voice, work) => {
    let checked = false;
    const segments = [];
    for (let i = 0; i < lines.length; i++) {
      const receiptPath = join(work, `ai33-${i}.json`);
      const file = join(work, `line-${i}.mp3`);
      let receipt: Receipt | undefined = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, "utf8")) : undefined;
      if (receipt?.state === "submitting") throw new Error(`Line ${i + 1}: submission outcome is unknown. Check AI33 task history before removing ${receiptPath} and retrying.`);
      if (!receipt) {
        if (!checked) {
          await checkAI33();
          checked = true;
        }
        // Reserve the line before posting so concurrent runs cannot bill it twice.
        writeFileSync(receiptPath, JSON.stringify({state: "submitting"}), {flag: "wx"});
        const response = await requestAI33("/v3/text-to-speech", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            text: lines[i].spoken,
            voice_id: voice.voice || ai33.defaultVoice,
            speed: 1, // The common TTS pipeline applies voice.tempo.
            with_transcript: false,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`AI33 submission HTTP ${response.status}. Check task history before retrying; receipt: ${receiptPath}`);
        const result = await response.json() as {success?: boolean; task_id?: string};
        if (result.success === false || typeof result.task_id !== "string" || !result.task_id) throw new Error(`AI33 returned no task ID. Check task history before retrying; receipt: ${receiptPath}`);
        receipt = {state: "submitted", taskId: result.task_id};
        await Bun.write(receiptPath, JSON.stringify(receipt));
      }
      if (!receipt.taskId) throw new Error(`Missing AI33 task ID in ${receiptPath}`);
      if (!existsSync(file)) {
        const deadline = Date.now() + TIMEOUT_MS;
        let done = false;
        while (Date.now() < deadline) {
          const res = await requestAI33(`/v1/task/${encodeURIComponent(receipt.taskId)}`, {signal: AbortSignal.timeout(30_000)});
          if (res.status >= 500 || res.status === 429) {
            await Bun.sleep(WAIT_MS);
            continue;
          }
          if (!res.ok) throw new Error(`AI33 task ${receipt.taskId}: HTTP ${res.status}; rerun to resume polling`);
          const task = await res.json() as Task;
          if (task.status === "error") throw new Error(`AI33 task ${receipt.taskId} failed: ${task.error_message || "unknown error"}`);
          if (task.status === "done") {
            const url = task.metadata?.audio_url;
            if (!url || new URL(url).protocol !== "https:") throw new Error(`AI33 task ${receipt.taskId} returned no HTTPS audio URL`);
            const audio = await fetch(url, {signal: AbortSignal.timeout(120_000)});
            if (!audio.ok) throw new Error(`AI33 audio download failed (HTTP ${audio.status}); rerun to resume`);
            const bytes = await audio.arrayBuffer();
            if (!bytes.byteLength) throw new Error(`AI33 task ${receipt.taskId} returned empty audio`);
            await Bun.write(file, bytes);
            console.log(`  + AI33 line ${i + 1}/${lines.length}: ${task.credit_cost ?? "?"} credits`);
            done = true;
            break;
          }
          await Bun.sleep(WAIT_MS);
        }
        if (!done) throw new Error(`AI33 task ${receipt.taskId} is still pending; rerun to resume polling`);
      }
      segments.push({file, lines: [{start: 0, end: Number.POSITIVE_INFINITY, words: null}]});
    }
    return segments;
  },
};
