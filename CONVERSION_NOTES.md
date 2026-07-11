# Parallax Explorer — Conversion Notes (Flash AS1 → Accessible HTML5)

## Behaviour model (one paragraph)

Parallax Explorer teaches **parallax** with a boat-on-a-lake analogy. The **Map**
panel is a top-down view of a lake with a road along the bottom; the user drags a
red **observer marker** left/right along the road (the "baseline"). The
**Observer's View** panel shows the first-person scene: a distant panorama of
hills behind the lake with the boat centred in the foreground. As the observer
moves, the near boat appears to shift against the far hills — parallax. The user
presses **take measurement** to draw a red sight-line from the observer toward the
boat; with a nonzero **error** the line becomes a shaded angular wedge whose
central direction is randomly perturbed by a (cutoff-clipped) Gaussian. Taking
measurements from several observer positions and looking at where the lines/wedges
cross reveals the boat's location — even when the boat is hidden. Three **presets**
(A/B/C) configure boat position/visibility, the error value and whether it is
adjustable, the starting observer position, and (preset C) a set of fixed observer
positions the marker snaps between. A **ruler** (20 m per unit) can be shown for
measuring. **Reset** restores Preset A.

## Source of truth
- **Behaviour:** decompiled ActionScript — `scripts/Parallax Explorer.as`,
  `scripts/Map.as`, `scripts/View Window.as`, `scripts/Slider Logic Class v6.as`,
  and the `on(initialize)` clip actions under
  `scripts/DefineSprite_235_Parallax Explorer/`.
- **Layout reference:** `Capture.PNG` (the running original) and `frames/1.png`.
- **Art:** exported `shapes/*.svg`, reused as-is (see below).

## Reused exported assets (never redrawn)
| Output file (`assets/`) | Source shape | Role |
|---|---|---|
| `map-background.svg` | `shapes/219.svg` | Full map art: lake, dotted shoreline, gray road, dashes |
| `view-panorama.svg` | `shapes/197.svg` | Observer's-View panorama strip (hills + lake), 1310.9×83.2 |
| `boat-top.svg` | `shapes/229.svg` | Orange boat, top view (Map) |
| `boat-side.svg` | `shapes/201.svg` | White sailboat, side view (Observer's View) |
| `observer-x.svg` | `shapes/223.svg` | Red "X" observer marker |
| `ruler.svg` | `shapes/168.svg` | Ruler (major divisions every 40 px) |
| `tree.svg` | `shapes/198.svg` | Tree, placed on the far hills of the view |

Only genuinely code-drawn geometry is reproduced on the canvas: the measurement
sight-lines/wedges (`Map.as` `beginFill`/`lineTo`), the observer's left/right
direction arrows, and the preset-C position markers (`attachMovie` loop).

The ruler's gradation **numbers 1–11** (bottom→top, at the 40-px major ticks) were
an embedded-font text field inside the Flash ruler sprite, not part of the exported
vector art (`shapes/168.svg` contains only the tick geometry), so they are redrawn
on the canvas as text using the verbatim digits from `texts/169.txt … 179.txt`.

## AS → HTML5 mapping (key constants, all verbatim)
- **Map limits:** `observerLeftLimit=18`, `observerRightLimit=442`,
  `rulerLeftLimit=20`, `rulerRightLimit=412`. Road-band centre → `OBSERVER_Y≈487.9`.
- **Presets** (`p.presetsList`) copied verbatim, including `boatPosition`,
  `observerPosition`, `error`, `cutoff`, `errorIsAdjustable`, `showBoat`,
  `observerPositionsList` (`[100,130]` for C).
- **Measurement** (`Map.as p.takeMeasurement`): `baseAngle = atan2(by-oy, bx-ox)`;
  if `error>0`, draw Gaussian `g` (reject while `|g|>cutoff`), offset the centre
  angle by `g*(error/cutoff)` degrees, draw a filled wedge ±`error`° (colour
  `0xFF0000`, fill alpha 8 %, line alpha 40 %), length 1000 stage px; else a single
  full-alpha ray. Randomised geometry is **frozen** into a record at take-time so
  `render()` redraws it deterministically. Deg→rad uses the source literal
  `0.017453292519943295`.
- **Gaussian** (`p.getRandomGaussian`): Marsaglia polar method, ported verbatim.
- **Observer drag/snap** (`p.observerOnMouseMoveFunc`): clamp to limits; when
  `observerPositionsList` is non-empty, snap to the nearest listed position.
- **Observer's View** (`View Window.as`): `angle = atan2(-(boatY-obsY), boatX-obsX)`;
  panorama `_x = (angle - π/2) * stripScale` with `stripScale=429.71834634811745`;
  boat centred, `z=(boatY-30)/370`, vertical `85 + z*10`, scale `100% + z*30%`.
- **Number format:** error shows fixed 1 decimal (slider `precision "fixed digits",
  1`), plus the degree glyph.
- **Reset:** masthead `sim-reset` event → select Preset A (`onReset` →
  `setSelectedIndex(0)` → `onPresetSelected`), restoring the exact initial state.

## Rendering / responsiveness
- Two `<canvas>` stages keep the **original Flash stage coordinates** (Map 461×515,
  View 250×103) at `devicePixelRatio` backing resolution, CSS-scaled to fit with
  preserved aspect ratio. Pointer coordinates are mapped back through the live
  scale so drag/snap math stays exact at any size (verified: desktop→iPad→phone
  portrait, single-column collapse via the foundation's 56rem breakpoint; no
  horizontal overflow at 1280 or 375 px, and at 200 % zoom).
- The Observer's-View panorama is drawn at native horizontal width (so the
  `stripScale` angle mapping is exact) and stretched only vertically to fill the
  viewport — a negligible distortion of a distant backdrop. Absolute framing of the
  view is approximated because the exact FLA placement/mask coordinates are not
  present in the decompiled ActionScript; the pedagogically essential quantity —
  the parallax shift `(angle-π/2)·stripScale` — is reproduced exactly.

## Deviations from the original (and why)
1. **No "show boat" checkbox.** `Parallax Explorer.as` references a
   `showBoatCheckBox` (handler `onShowBoatChanged`), but the shipped SWF exposes
   **only** the "show ruler" checkbox — `Capture.PNG` shows a single checkbox, and
   the decompiled clip-init actions define only the "show ruler" `FCheckBoxSymbol`.
   The `showBoatCheckBox` reference is vestigial (its handler is never wired to a
   control), so boat visibility is driven **entirely by the selected preset**, as in
   the shipped sim. Omitting the checkbox matches observed behaviour and the
   screenshot. (Consequence: in presets B and C the boat stays hidden — this is the
   intended pedagogy: you locate the unseen boat by triangulating sight-lines.)
2. **Help button present.** The original title bar had `helpLinkageName = ""`
   (no Help). The shared KL-UNL `contents.json` already contains a
   `parallaxExplorer` entry **with** Help content authored by the AAS Task Force.
   That entry is retained as-is (the masthead shows Help when content is non-empty).
   The About/Help wording therefore comes from the pipeline's own entry, which
   already reflects the original "Cosmic Distance Ladder Module … NAAP" boilerplate.
3. **Editable numeric error field → read-only readout.** The original slider has a
   small editable value field. Here the value is a labelled `<output>` beside a
   native `<input type="range">`; the range is the single, fully keyboard-operable
   control for the value. Functionally equivalent (sets the same `error` state).
4. **Observer's-View absolute framing approximated** (see Rendering, above).
5. **Far-shore trees re-placed by hand.** The trees on the hills (reused shape
   `198`) are separate overlaid sprites in the original View Window, not part of
   the panorama strip (`197`, which is only sky/hills/water gradients). Their
   exact FLA placements are not in the decompiled ActionScript, so the tree
   positions/scales (`TREES` in `simulation.js`, in panorama-strip coordinates)
   were tuned against the original screenshots. They scroll with the panorama and
   act as the fixed reference points that make the boat's parallax shift visible.

## The contents.json entry
No entry needed to be **added**: the shared `foundation/contents.json` already
contains a `parallaxExplorer` key (sim-id `parallaxExplorer`, title
"Parallax Explorer") with About/Help matching the original NAAP boilerplate. The
sim references it via `<kl-unl-masthead sim-id="parallaxExplorer"
json-url="foundation/contents.json">`.

### Necessary JSON-validity corrections to the copied contents.json (IMPORTANT)
The provided `foundation/contents.json` is **not valid JSON as shipped** — the
browser's `JSON.parse` (used by the masthead) fails on it, which would break the
title/Help/About for **every** sim, not just this one. To make the masthead load,
the copied file in `html5/foundation/contents.json` was corrected with the
**minimum** changes needed, none of which touch the `parallaxExplorer` entry or
alter any content meaning:

1. **Unescaped raw control characters inside string values** (illegal in JSON):
   raw newlines / tab inside the `content` strings of the `ce_hc` and
   `eclipsingbinarysim` entries were normalised to spaces. (A character-level state
   machine replaced only control characters that occur **inside** string literals;
   structural whitespace was untouched.)
2. **Unescaped double quotes** in two relative links: `href="../venusphases"`
   (`renaissancePtolemaic`) and `href="../ptolemaic"` (`venusphases`) were escaped
   to `href=\"…\"`.

After these corrections the file parses cleanly (108 entries) in the browser.
**Recommendation:** fix these defects upstream in the shared `contents.json` so
every sim benefits; this copy contains the corrected version.

> Note: the file also contains a duplicated `moonphases` key. Browser
> `JSON.parse` tolerates duplicate keys (last one wins), so it was left as-is; some
> stricter parsers (e.g. Windows PowerShell 5.1 `ConvertFrom-Json`) reject it.

## Self-verify summary (no emulator)
Verified by serving over HTTP and driving the page: both canvases render from the
reused assets (map lake/road/shore + orange boat + red X + arrows + ruler + exact
sight-line; view panorama + centred white boat); presets switch correctly (boat
visibility, error value + enable/disable, observer snap 100↔130 in C);
measurements accumulate and persist across observer moves; parallax shifts the
panorama as the observer moves; masthead Reset restores Preset A and clears
measurements; About opens/closes; layout is two-column on desktop and single-column
on narrow widths with no horizontal overflow.
