# Visual rules: general, plus the index of visual types

> Part of [`SOUL.md`](../../SOUL.md). This file holds **§5**, the rules for every
> visual type. Rules specific to one visual type live in
> [`docs/visuals/`](../visuals/README.md), one file each. Truth-in-pictures and
> licence rules are **[hard]**; the rest is **[craft]**.

---

## 5. Visual rules

Channel override: do not place credits, source watermarks or standalone
disclaimers on video. Record attribution and caveats separately for the user's
post-production. Make the underlying depiction accurate without relying on a
disclaimer to correct a misleading visual.

**Flow and visual type are two independent axes.** Flow is how the story is told
(one per video); visual type is how it reaches the screen (a combination per video).
The same flow ran on four different visual combinations in the source pipeline, and
the same visual combination appeared under five flows. Each video declares its
combination in `narration.json` → `visual`.

| id | § | One line |
| --- | --- | --- |
| [`text-as-image`](../visuals/text-as-image.md) | §5a | one sentence fills the frame; the camera moves inside the sentence |
| [`timeline`](../visuals/timeline.md) | §5b | the stage is YEARS, not a place; the axis is true to scale |
| [`archive-plate`](../visuals/archive-plate.md) | §5c | a real artefact is the subject; provenance in the hand-off record |
| [`news-photo`](../visuals/news-photo.md) | §5d | photos of the event itself; credits in the hand-off record |
| [`gif`](../visuals/gif.md) | §5e | no coordinates, no artefact: a looping clip carries rhythm, text carries facts |
| [`b-roll`](../visuals/b-roll.md) | §5f | real footage under the narration, anchored to sentences |
| [`illustrated-scene`](../visuals/illustrated-scene.md) | §5g | no usable photos or footage: build one world from simple drawn layers and stay in it |
| [`satellite-map`](../visuals/satellite-map.md) | §5h | the claim lives on the ground: fly over real imagery and draw the facts on it |
| [`globe`](../visuals/globe.md) | §5i | the claim spans the planet: lines on a sphere, true distances, the pull-out reveal |
| [`talking-head`](../visuals/talking-head.md) | §5j | a filmed take is the voice: words as said, cut by reason, effects off the face |

The kit ships no map or globe types. If your niche needs one, add it as a visual
type (see the README); the general rules below still apply.

### Rule zero: decide the visual language BEFORE the script

A whole family of claims does not live on any stock image: a word, a year, a name, a
behaviour, a ratio. The first video that met this in the source pipeline spent 49% of
its length on three scenes where the background proved nothing, so the screen was
text on wallpaper. For every claim, decide at the brief which visual type carries
it, **and check the licence then**. If no claim fits any visual type you have, the
topic is not buildable yet; do not write the script first.

### The thing being said must be on screen

- **Graphics are drawn ONTO the subject, not floated as cards.** Lines, arrows with
  measurements, a red X at the exact spot, a filled region, a dot with a real name.
  A stats card floating mid-screen is a different mood and proves nothing.
- **Do not let an available asset drive the edit.** One video ran its last two
  blocks on the only licensed image the topic allowed; the closing line was about a
  boundary, and there was no boundary on screen. The image also turned out unusable
  at every zoom: sixteen seconds of empty frame, and the one viewer comment was
  "broken picture, nothing there". Sign: **if you change the framing a third time,
  the shot has nothing in it.** Drop it. The question is always "is the thing being
  said on screen?" A beautiful image that is not the subject is an **insert**, not a
  stage.
- **No empty shots.** A shot whose content is too small, too blurry or too uniform
  to read is a broken shot, even if every check passes. Check stills, and check the
  *darkest* and *blandest* background in the video, not the prettiest.
- **Resolution must hold along the whole move**, not just at the ends. A layer that
  only becomes sharp at the final frame means 19 seconds of a 4×-upscaled image
  before it, not an error, just blur, and nobody reports blur. Measure source pixels
  per screen pixel along the move.

### Truth in pictures

- **Scale is an ethical question.** A timeline or comparison is either true to scale
  or labelled "not to scale" on frame. No third option. Squeezing marks to even
  spacing is lying with a picture: the exact thing flow E makes into a topic.
- **Every artefact carries its date.** An undated artefact is being borrowed to say
  something it does not say. A 13th-century textile behind a story set in 552 must
  show the seven-century gap; shown, it is still evidence; hidden, it is a trick.
- **Portraits: date the painting, not the person.** Portraits from before ~1500 are
  mostly imagined later. Caption "painting, 19th century", never just the sitter's
  life dates. No contemporary likeness? Do not build a face; show something truly
  tied to the person (a signature, a decree, a ship, a grave).
- **Editing evidence: crop, and brighten evenly. Nothing more.** No local contrast,
  no saturation or hue changes around the point you are making: that manufactures
  evidence. Log every edit in the video's credits.
- **No fake headlines, documents or interfaces** standing in for a point. A press
  headline component is only for a headline that exists.
- **"Phrased after" is said aloud.** A drawn path or curve that is a sketch of a
  published model, not measured data, says so on frame and in the caption.

### Licence order (applies to every visual type)

**PD / CC0 → CC BY → (ask first) CC BY-SA → never CC BY-NC.** A scan with no stated
licence is not usable. The work being out of copyright and the *scan* being free are
separate questions; a photo of an old painting or of a statue carries the
photographer's licence. Open-access museums (CC0) are the best source: check the
licence via the museum's API, not by guessing from the page. Items rejected for
licence are recorded with the reason, like cut facts, or someone searches for them
again in six months.

### Title and caption say two halves

The caption follows the voice word by word, so a headline that copies the sentence
being spoken shows the same sentence twice on one frame. In one audit, **six of eight
scenes** did this: writing the headline by copying the line is the default reflex,
and it is wrong every time. On-frame text rules are in §7.

### Tall visual card + ambient blur layout (1080×1920) [default]

For editorial photo/card explainers on a 1080×1920 canvas (`tallCardLayout` in
`thresholds.json`), fill the vertical frame with a 4:5 portrait card and a
scene-synced blurred background instead of leaving empty gradient voids around a
16:9 box:

1. **Ambient blurred background (`AmbientBackdrop`):** replace static dark/green
   gradients with a duplicated copy of the active scene image filling `1080×1920`
   at `z-index: 0`, filtered with `blur(50px) brightness(0.25) saturate(1.3)`,
   topped with an edge vignette and a subtle grid or dot pattern at `6%` opacity so
   foreground card borders stand out cleanly.
2. **Expanded 4:5 portrait card (`TallCardLayout`):** size the main image stage
   as a **4:5 portrait card** at `774 px` wide (`x = 153..927`, clearing the
   right-side action buttons) by `920–960 px` tall (`950 px` default; or up to
   `1098 px` when the top title box is omitted). Use `object-fit: cover`, bias
   framing toward faces (`object-position: center 20%` by default), and apply a
   continuous slow Ken Burns zoom (`1.0 → 1.1`) or gentle pan to every photo.
3. **Compact vertical spacing:** group `[Top Title Box + 4:5 Portrait Card + Bottom Info Box]`
   with tight `16–20 px` inter-block gaps (`18 px` default), seated below the
   `280 px` top UI margin and `70–90 px` (`74 px` default) above the subtitle band.
4. **Vertical coordinate map (1080×1920):**
   - `0–280 px`: top safe buffer (ambient blurred background behind status bar + TikTok `Explore/Following/For You` + search icon)
   - `280–410 px` (`130 px` tall, `774 px` wide): top title box (optional)
   - `428–1378 px` (`950 px` tall, `774 px` wide): 4:5 portrait image card (`280–1378` when title box omitted)
   - `1396–1516 px` (`120 px` tall, `774 px` wide): lower info callout box
   - `1590–1660 px`: subtitle line (`74 px` below the info box, keeping existing font size and highlight style)
   - `1660–1920 px` (`260 px` tall): bottom safe zone for TikTok channel name and caption (`260–300 px` minimum clearance from the bottom edge)

Shared implementation: `src/shared/frame/AmbientBackdrop.tsx` and
`src/shared/frame/TallCardLayout.tsx`.

### Endings

End on the turn of the script. **No** logo or @handle outro. Free trick: **the last
scene can be the opening scene run backwards**: it costs no words and closes the
whole piece.
