/** Read-only provider search. No API key is printed or stored in results. */
import {createHash} from "node:crypto";
import {mkdir, readFile, stat, writeFile} from "node:fs/promises";
import {join} from "node:path";

const [provider, ...terms] = process.argv.slice(2);
const query = terms.join(" ").trim();
const modes = ["web", "images", "pexels", "pexels-video", "pixabay", "pixabay-video"];
if (!provider || !modes.includes(provider) || !query) {
  console.error(`Usage: bun run search <${modes.join("|")}> "search terms"`);
  process.exit(1);
}

const envName = provider === "web" || provider === "images" ? "SERPER_API_KEY" : provider.startsWith("pexels") ? "PEXELS_API_KEY" : "PIXABAY_API_KEY";
const key = process.env[envName];
if (!key) {
  console.error(`${envName} is missing from .env`);
  process.exit(1);
}

const cacheDir = join(process.cwd(), ".cache", "search");
const cacheName = createHash("sha256").update(JSON.stringify([provider, query, key])).digest("hex");
const cachePath = join(cacheDir, `${cacheName}.json`);
const isPixabay = provider.startsWith("pixabay");
if (isPixabay) {
  try {
    if (Date.now() - (await stat(cachePath)).mtimeMs < 24 * 60 * 60 * 1000) {
      process.stdout.write(await readFile(cachePath, "utf8"));
      process.exit(0);
    }
  } catch { /* no usable cache */ }
}

let url: URL;
let init: RequestInit;
if (provider === "web" || provider === "images") {
  url = new URL(`https://google.serper.dev/${provider === "web" ? "search" : "images"}`);
  init = {method: "POST", headers: {"X-API-KEY": key, "Content-Type": "application/json"}, body: JSON.stringify({q: query, num: 10})};
} else if (provider.startsWith("pexels")) {
  url = new URL(provider === "pexels" ? "https://api.pexels.com/v1/search" : "https://api.pexels.com/v1/videos/search");
  url.search = new URLSearchParams({query, per_page: "10"}).toString();
  init = {headers: {Authorization: key}};
} else {
  if (query.length > 100) { console.error("Pixabay queries must be at most 100 characters."); process.exit(1); }
  url = new URL(provider === "pixabay" ? "https://pixabay.com/api/" : "https://pixabay.com/api/videos/");
  url.search = new URLSearchParams({key, q: query, per_page: "10", safesearch: "true"}).toString();
  init = {};
}

try {
  const response = await fetch(url, {...init, signal: AbortSignal.timeout(30_000)});
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}`);
  const result: unknown = await response.json();
  const output = JSON.stringify(result, null, 2) + "\n";
  if (isPixabay) {
    await mkdir(cacheDir, {recursive: true});
    await writeFile(cachePath, output, "utf8");
  }
  process.stdout.write(output);
} catch (e) {
  // Network exceptions may contain a URL with Pixabay's key: never print them.
  const msg = e instanceof Error && / returned HTTP \d+$/.test(e.message) ? e.message : `${provider} request failed or timed out`;
  console.error(msg);
  process.exit(1);
}
