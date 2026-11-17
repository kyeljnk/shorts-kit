# shorts-kit

A kit for making narrated vertical shorts (TikTok, YouTube Shorts, Reels) with a coding agent and Remotion.

For new narration, use the user's AI33 service (`voice.engine: "ai33"`). For Vietnamese, the default voice is `vbee_hn_male_minhquan_yt_24k-pre`; the user may choose another AI33 voice. The key is `AI33_API_KEY` in the local, gitignored `.env`. AI33 usage consumes credits. The engine returns line-level audio; word timings are estimated and need review.
Channel setup is recorded in the "Channel direction" section of SOUL.md; it overrides conflicting source-channel creative defaults. AI33 task receipts persist in the TTS cache, including on `--force`, to avoid accidentally charging again; review task state before intentionally clearing a receipt for a new reading.

Research and media search: `bun run search web "query"` and `bun run search images "query"` use Serper; `pexels`, `pexels-video`, `pixabay`, and `pixabay-video` search stock. Keys are in the gitignored `.env`. For specific photos or footage search Wikimedia Commons first where suitable, then these sources; check each asset's provenance and licence before use, preserve attribution, and do not assume Google Images results are licensed for reuse. Pixabay search results are cached for 24 hours.

AI video generation (when needed): `bun run fal` calls Black Forest Labs FLUX 3 Max on fal.ai (`blackforestlabs/flux-3-max/text-to-video`, `image-to-video`, and `keyframes-to-video`) using `FAL_KEY` in the gitignored `.env`. Because generation is billed per second of video, `scripts/fal.ts` saves task receipts in `.cache/fal/` so interrupted runs resume polling the existing `request_id` instead of submitting duplicate jobs. Use `bun run fal check` to verify key/pricing without spending credits.

Do not put credits, source watermarks, or standalone disclaimers in the video or narration: the user handles them in post-production. Keep source, licensing, attribution requirements and relevant caveats in separate hand-off records and flag placement-specific obligations. Preserve accurate, properly qualified claims in the story.

**For any request to make, edit, render or hand off a short, invoke the `sk-pipeline` skill first and follow it.**
Runtimes without a Skill tool: read `.claude/skills/sk-pipeline/SKILL.md` (also at `.agents/skills/`).

## Read first

`SOUL.md` is the index of every rule, the pipeline order and the pre-hand-off checklist.
SOUL.md is this channel's editable defaults; to change a rule use `sk-improve`.
Open only the `docs/soul/` file for the step you are on. Exact commands per step: `docs/making-a-video.md`.

## The three first rules

1. **Facts before words.** No sentence is written before its claim has a `verified` record in `docs/facts/` (§9).
2. **Visual language before the script.** Decide how each claim gets on screen, and check every image licence, before writing narration (§5).
3. **End on the payoff and an open question.** Cut promptly and consider a natural loop (§1).

## Skills (`.claude/skills/`)

| Skill | Use for |
|---|---|
| `sk-pipeline` | the whole video, in order; start here |
| `sk-brief` | idea, flow, visual types, licences, `briefs/<id>.md` |
| `sk-facts` | sourcing, verifying, ledger records, image licences |
| `sk-narration` | `narration.json`, TTS, lint |
| `sk-style` | polishing wording without changing meaning |
| `sk-scene` | Remotion scenes, safe zones, still review |
| `sk-render` | render, normalize, encode, ffprobe checks |
| `sk-handoff` | cover, caption, pinned comment and credits |
| `sk-improve` | lessons from posted videos, changing rules and thresholds |

## Commands

```bash
bun run new <id> --flow <A..T>   # scaffold src/videos/<id>/
bun run dev <id>                 # Remotion Studio
bun run tts <id> [--force]       # voice.mp3 + voice.json
bun run from <file|dir>...       # "edit my video": new + ingest (every clip) + cut + storyboard stub
bun run ingest <id> <file>...    # recorded voice: Whisper transcript + proposed cuts (§5j)
bun run cut <id>                 # apply cuts.json: voice.mp3 (+ cut.mp4), voice.json
bun run lint <id>                # checks from docs/soul/thresholds.json
bun run storyboard <id> [--init|--sync] # shot list after the voice; --sync after tts/cut
bun run satellite <id>           # satellite mosaics (map.json shots)
bun run geo <id>                 # coasts, borders, rivers (Natural Earth)
bun run facts                    # validate docs/facts/*.json
bun run still <id> [--frame=N]   # out/<id>/still-<N>.png
bun run render <id>              # out/<id>/<id>.mp4
bun run cover <id>               # out/<id>/<id>-cover.png
bun run normalize <id>           # out/<id>/<id>-loud.mp4
bun run encode <id>              # out/<id>/<id>-upload.mp4
bun run preview                  # local dashboard: progress, script, storyboard, hand-off
bun run check                    # boundaries + tsc --noEmit
```

## Never

- **Never auto-publish.** The pipeline ends at hand-off files in `out/<id>/`; the user uploads by hand.
- **Never hand-edit `voice.json`.** It is generated by `bun run tts <id>`; change `narration.json` and re-run TTS.
- **A video never imports another video.** Shared code goes in `src/shared/`; `bun run check` enforces it.
- Never claim a scene or render is done without opening the still or frame.
- Never rewrite a posted video to fit a new rule; rules apply to the next video.
