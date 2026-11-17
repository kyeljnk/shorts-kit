import {checkAI33} from "./lib/engines/ai33";
import {die} from "./lib/paths";

if (process.argv.length !== 3 || process.argv[2] !== "check") die("Usage: bun run ai33 check");

try {
  await checkAI33();
  console.log("AI33 API is reachable and accepted the configured key. No credits spent.");
} catch (error) {
  die(`ai33: ${(error as Error).message}`);
}
