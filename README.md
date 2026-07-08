# Parallax Explorer (Accessible HTML5)

An accessible HTML5 re-creation of the legacy Flash **Parallax Explorer**
(`parallaxExplorer009.swf`), built on the shared KL-UNL foundation. Behaviour
matches the original; chrome, layout, and accessibility follow the KL-UNL
pipeline and WCAG 2.1 AA.

## This sim must be served over HTTP — it will NOT run from a double-clicked file

Opening `index.html` directly (a `file://` path) shows an empty/broken title
bar. **Why:** the KL-UNL masthead (`foundation/kl-unl-masthead.js`) loads its
title / Help / About text with `fetch('foundation/contents.json')`, and browsers
block `fetch()` of local files over `file://` for security (same-origin policy).
Served over HTTP the fetch succeeds and the sim loads normally.

## How to run locally

Serve **from inside this `html5/` folder**, then open the shown URL:

```
# Python 3
python3 -m http.server 8123
# then open  http://localhost:8123/

# Node
npx serve
# or:  npx http-server

# VS Code
# Use the "Live Server" extension and "Open with Live Server".
```

Because you serve from inside `html5/`, the sim is at the server **root** — the
URL is `http://localhost:8123/`, not `.../html5/index.html`.

> On a machine without Python/Node, any static file server works. During
> development this project was served with a small PowerShell `HttpListener`
> script; any equivalent is fine.

## Production

When deployed to the KL-UNL cloud host (served over HTTP/HTTPS) it just works.
The `file://` limitation only affects local double-clicking.

## What's in this folder

```
index.html            KL-UNL scaffold: .app-shell + <kl-unl-masthead> + panels
foundation/           KL-UNL foundation files (masthead, CSS, MathJax helper,
                      contents.json). Copied from the source; see CONVERSION_NOTES
                      for the one necessary JSON-validity correction.
styles/styles.css     Sim-specific styles only (never overrides the foundation)
simulation.js         All sim logic (state, render, physics, drag + keyboard)
assets/               Exported artwork reused as-is (lake/road map, panorama,
                      boats, observer marker, ruler) — SVGs from the decompile
CONVERSION_NOTES.md   Behaviour model, AS->HTML5 mapping, deviations
ACCESSIBILITY.md      WCAG affordances, ARIA, keyboard map, live-region wording
```
