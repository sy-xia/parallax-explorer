# Parallax Explorer — Accessibility (WCAG 2.1 AA)

Built on the KL-UNL foundation (masthead + `kl-unl.css` focus/contrast system).
Human screen-reader QA on **NVDA (Windows)** and **VoiceOver (macOS)** is still
required before release; this document records the affordances that are in place.

## Structure & landmarks
- One `<h1>` — the simulation title — is rendered by the `<kl-unl-masthead>`
  component; the page adds no competing `h1`. Panels use `<h2>` (`Map`,
  `Observer's View`, `Controls`) in a non-skipping order.
- Semantic regions: `<main class="app-shell">`, `<section class="panel">` per
  panel, `<fieldset>/<legend>` for the controls, real `<label>`s for every input.
  `<html lang="en">`.

## Text alternatives for the canvases (1.1.1)
Neither canvas is the accessibility layer. Each has an associated, continuously
updated visually-hidden description (`aria-describedby`), refreshed from the single
`render()`:
- **Map:** states whether the boat is visible/hidden, the observer position in
  metres, any fixed positions (A/B), the number of measurement sight-lines, and the
  ruler position when shown.
- **Observer's View:** describes the panorama + centred boat and the current bearing
  to the boat in degrees, and explains the parallax effect.
The map's `lake` / `road` labels are real HTML text overlays (zoomable), not
canvas-baked pixels. The ruler's small **1–11 gradation numbers** are drawn on the
canvas (they move with the draggable ruler, matching the original); they are
decorative scale markings — the ruler's position and the map scale (20 m per unit)
are conveyed in text via the ruler proxy's `aria-valuetext` and the on-screen
"map scale" note.

## Draggable objects: pointer AND keyboard (2.1.1)
Both the **observer marker** and the **ruler** are exposed as focusable proxies
(`role="slider"`, `tabindex="0"`) layered over the map canvas:
- **Tab to focus** — each is in the tab order with a visible `:focus-visible` ring.
- **Click/tap to focus** — a pointer-down on the marker/ruler on the canvas calls
  `.focus()` on the matching proxy, so the arrow keys work immediately without
  tabbing first.
- **Arrow keys** move horizontally (`←/↓` decrement, `→/↑` increment);
  `PageUp/PageDown` = larger step; `Home/End` = min/max. In preset C the observer
  moves **between the fixed positions** (A ↔ B), matching the source's snapping.
- Pointer and keyboard mutate the **same state**; Tab always escapes normally
  (no keyboard trap); canvas pointer handlers do not swallow focus or key events.
- `touch-action: none` on the canvas so dragging doesn't scroll/zoom the page;
  Pointer Events give one code path for mouse + touch (works on iOS Safari).

## Error slider (2.1.1 / 4.1.2)
Native `<input type="range">` (min 0, max 10, step 0.1) with a real `<label>`
("error:"). Fully keyboard-operable for free (arrows / Page / Home / End); it is
disabled in presets B and C exactly as the source disables it
(`errorIsAdjustable=false`). The value is announced with quantity + unit via
`aria-valuetext` (e.g. *"error 5.0 degrees"*).

## Always speak units with numbers
Every value with a unit is announced with its quantity name **and** unit, never a
bare number:
- Error slider `aria-valuetext`: *"error 5.0 degrees"*.
- Observer proxy `aria-valuetext`: *"Observer position 100 meters along the road"*.
- Ruler proxy `aria-valuetext`: *"Ruler at horizontal position 50 meters"*.
- Live-region messages spell units as words ("degrees", "meters").
Positions use the map scale (**20 m per ruler unit = 0.5 m/px**) derived from the
ruler's 40-px major divisions.

## Live region (4.1.3)
An `aria-live="polite"` status region announces meaningful changes **on commit**
(debounced, not per drag-tick), with units and context — e.g. *"Preset A selected.
Boat visible. Error 0.0 degrees, adjustable."*, *"Observer at 110 meters along the
road."*, *"Measurement taken from observer position 100 meters along the road.
Sight line drawn toward the boat with an error of plus or minus 5.0 degrees."*,
*"Measurements cleared."*, *"Ruler shown."*, *"Simulation reset. Preset A restored."*

## Colour & contrast (1.4.1 / 1.4.3 / 1.4.11)
Uses the KL-UNL palette variables. State is never conveyed by colour alone: the
observer marker is a shape (red **X**) plus text position; measurement direction is
geometric; the boat's presence is stated in text. The reused red sight-lines keep
the original's meaning and are described in the live region and map description, so
colour is supplementary. No sim colours were remapped from the source.

## Timing / motion (2.2.2 / 2.3.3)
The sim is entirely event-driven — there is **no continuous animation, no flashing,
and no auto-running motion**, so no Pause control is required. A
`prefers-reduced-motion` block disables any incidental CSS transitions.

## Type size & zoom (1.4.4 / 1.4.10)
Body copy is ≥ 1.125 rem in `rem`/`em`; headings/controls scale up. Layout uses
relative units and reflows (single column on narrow widths) with no clipping or
horizontal scroll at 200 % zoom. Canvas-internal labels were moved to HTML overlays
where practical.

## Cross-browser / touch
Standards-based HTML/CSS/JS (no Chrome-only APIs, no prefix-only CSS). Pointer
Events + `touch-action:none` for iOS Safari; interactive targets ≥ 44 px
(2.75 rem). Self-hosted/foundation fonts with safe fallbacks.

## Known limitation — MathJax / rule "all math via MathJax"
The KL-UNL pipeline renders displayed maths with MathJax via `kl-unl.js`, **but the
foundation snapshot provided with this sim ships no MathJax library**, and the
project forbids loading it from a CDN. This sim has essentially no mathematical
notation — the only math symbol is the **degree glyph** on the error value. It is
presented as accessible text (visible `5.0°`, spoken *"5.0 degrees"*). The code
still wires the foundation's `klunlShowEquation` / `klunlInitEqn` hooks (an
`#pe-error-eqn` container and an SR message), which activate automatically **iff**
the deployment provides `window.MathJax`, typesetting the degree readout as LaTeX
`\(5.0^{\circ}\)`. No broken/CDN script is loaded locally, so there are no console
errors. **Action for deployment:** include the pipeline's MathJax build so the
degree symbol is MathJax-typeset (and thus exposes the "Show Math As" menu) to fully
satisfy the pipeline's math rule.
