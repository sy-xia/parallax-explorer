// ============================================================================
// Parallax Explorer -- accessible HTML5 port of parallaxExplorer009.swf (AS1)
//
// Behaviour is ported verbatim from the decompiled ActionScript:
//   scripts/Parallax Explorer.as   (controller / presets)
//   scripts/Map.as                 (top-down map: observer drag, ruler drag,
//                                    measurement sight-lines, gaussian error)
//   scripts/View Window.as         (Observer's View: parallax panorama shift)
//
// All drawing math stays in the ORIGINAL Flash stage coordinates; the canvases
// keep their native backing size and are scaled to fit by CSS.
// ============================================================================

'use strict';

// ---------------------------------------------------------------------------
// Reused exported assets (copied byte-for-byte from the decompiled export).
// Each SVG's registration point (the FLA symbol origin) matches the <g>
// transform in the source file, noted below.
// ---------------------------------------------------------------------------
const ASSETS = {
  mapBackground: 'assets/map-background.svg', // shape 219: lake + shore + road
  panorama:      'assets/view-panorama.svg',  // shape 197: hills/lake strip
  boatTop:       'assets/boat-top.svg',       // shape 229: orange boat (map)
  boatSide:      'assets/boat-side.svg',      // shape 201: white boat (view)
  observerX:     'assets/observer-x.svg',     // shape 223: red X marker
  ruler:         'assets/ruler.svg'           // shape 168: measuring ruler
};

// Registration offsets (pixel location of the symbol origin inside each SVG).
const REG = {
  boatTop:   { x: 13.45, y: 15.55 }, // matrix(...,13.45,15.55)
  observerX: { x: 9.0,   y: 9.0 },   // matrix(...,9,9) -> centre
  ruler:     { x: 0.55,  y: 480.5 }, // matrix(...,0.55,480.5) -> bottom-left
  boatSide:  { x: 6.1,   y: 16.95 }  // matrix(...,6.1,16.95) -> bottom-centre
};

// ---------------------------------------------------------------------------
// Map constants (from Map.as)
// ---------------------------------------------------------------------------
const MAP_W = 461;
const MAP_H = 515;
const OBSERVER_LEFT  = 18;    // p.observerLeftLimit
const OBSERVER_RIGHT = 442;   // p.observerRightLimit
const RULER_LEFT     = 20;    // p.rulerLeftLimit
const RULER_RIGHT    = 412;   // p.rulerRightLimit
const OBSERVER_Y      = 487.9; // road-band centre (road spans y 478.9..496.9)
const MEASUREMENT_LEN = 1000;  // sight-line length in stage px (from Map.as)
const DEG2RAD = 0.017453292519943295; // matches the literal in Map.as

// Map scale: ruler major division = 40 px = 1 ruler unit = 20 m  ->  0.5 m/px.
const METERS_PER_PX = 0.5;

// ---------------------------------------------------------------------------
// View Window constants (from View Window.as)
// ---------------------------------------------------------------------------
const V_MIN_SCALE = 100;                  // p.minBoatScale
const V_MAX_SCALE = 130;                  // p.maxBoatScale
const V_TOP_BOAT  = 85;                   // p.topBoatPosition
const V_BOT_BOAT  = 95;                   // p.bottomBoatPosition
const STRIP_SCALE = 429.71834634811745;   // p.stripScale (px per radian)
const STRIP_W = 1310.9;                   // native panorama width  (shape 197)
const STRIP_H = 83.2;                     // native panorama height (shape 197)
const VIEW_W = 250;                       // Observer's-View viewport (stage px)
const VIEW_H = 103;
const VIEW_CX = VIEW_W / 2;               // boat is always centred in the view
const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------------
// Presets -- copied verbatim from p.presetsList in Parallax Explorer.as
// ---------------------------------------------------------------------------
const PRESETS = [
  { name: 'Preset A', showBoat: true,  boatVisibilityIsAdjustable: true,
    error: 0, cutoff: 2, errorIsAdjustable: true,
    boatPosition: { x: 395, y: 190 }, observerPosition: 200, observerPositionsList: [] },
  { name: 'Preset B', showBoat: false, boatVisibilityIsAdjustable: true,
    error: 3, cutoff: 2, errorIsAdjustable: false,
    boatPosition: { x: 220, y: 220 }, observerPosition: 300, observerPositionsList: [] },
  { name: 'Preset C', showBoat: false, boatVisibilityIsAdjustable: false,
    error: 5, cutoff: 2, errorIsAdjustable: false,
    boatPosition: { x: 180, y: 150 }, observerPosition: 100, observerPositionsList: [100, 130] }
];

// ---------------------------------------------------------------------------
// Single source of truth: one state object; render() redraws everything.
// ---------------------------------------------------------------------------
const state = {
  presetIndex: 0,
  boat: { x: 395, y: 190 },
  boatVisible: true,
  observerX: 200,
  observerPositionsList: [],
  error: 0,             // slider value (degrees)
  errorAdjustable: true,
  cutoff: 2,
  showRuler: false,
  rulerX: 100,          // ruler placed at _x:100 in Map.as
  measurements: []      // frozen sight-line records, drawn every render()
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const el = {};
let mapCtx, viewCtx, dpr = 1;
const images = {};

// ===========================================================================
// Asset loading
// ===========================================================================
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

async function loadAssets() {
  const entries = Object.entries(ASSETS);
  const loaded = await Promise.all(entries.map(([, src]) => loadImage(src)));
  entries.forEach(([key], i) => { images[key] = loaded[i]; });
}

// ===========================================================================
// Number formatting (matches the "fixed digits", precision 1 slider display)
// ===========================================================================
function fixed1(x) { return x.toFixed(1); }

// ===========================================================================
// Gaussian random -- ported verbatim from Map.as p.getRandomGaussian
// (Marsaglia polar method). Preserves the original rejection loop.
// ===========================================================================
function getRandomGaussian() {
  let x1 = 0, x2 = 0, w = 0;
  do {
    x1 = 2 * Math.random() - 1;
    x2 = 2 * Math.random() - 1;
    w = x1 * x1 + x2 * x2;
  } while (w >= 1);
  w = Math.sqrt(-2 * Math.log(w) / w);
  return x1 * w;
}

// ===========================================================================
// takeMeasurement -- ported from Map.as p.takeMeasurement.
// Freezes the (randomised) geometry into a measurement record so render()
// can redraw it deterministically.
// ===========================================================================
function takeMeasurement() {
  const bx = state.boat.x, by = state.boat.y;
  const ox = state.observerX, oy = OBSERVER_Y;
  const baseAngle = Math.atan2(by - oy, bx - ox); // _loc6_
  const errorLimit = state.error;                 // slider value, degrees
  const cutoff = state.cutoff;

  let rec;
  if (errorLimit > 0) {
    let g;
    do { g = getRandomGaussian(); } while (Math.abs(g) > cutoff); // rejection
    const offset = g * (errorLimit / cutoff);       // _loc13_ (degrees)
    const center = baseAngle + offset * DEG2RAD;     // _loc8_
    const upper  = center + errorLimit * DEG2RAD;     // _loc10_
    const lower  = center - errorLimit * DEG2RAD;     // _loc9_
    rec = { type: 'wedge', ox, oy, upper, lower };
  } else {
    rec = { type: 'line', ox, oy, angle: baseAngle };
  }
  state.measurements.push(rec);

  announce('Measurement taken from observer position ' +
    Math.round(ox * METERS_PER_PX) + ' meters along the road. ' +
    (errorLimit > 0
      ? 'Sight line drawn toward the boat with an error of plus or minus ' +
        fixed1(errorLimit) + ' degrees.'
      : 'Exact sight line drawn toward the boat, no error.'));
  render();
}

function clearMeasurements() {
  state.measurements = [];
  announce('Measurements cleared.');
  render();
}

// ===========================================================================
// MAP rendering
// ===========================================================================
function drawMap() {
  const ctx = mapCtx;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, MAP_W, MAP_H);

  // 1. Reused background art (lake, dotted shore, road). The source SVG shifts
  //    its artwork +0.5px inside its viewBox, leaving ~1px of transparent canvas
  //    at the left/right edges; bleed the image 1px horizontally so the fill
  //    reaches the frame with no gap. (Decorative only -- markers below are still
  //    drawn in exact stage coordinates.)
  ctx.drawImage(images.mapBackground, -2, 0, MAP_W + 4, MAP_H);

  // 2. Measurement sight-lines (code-drawn in AS via lineTo/beginFill).
  //    Colour 16711680 = #FF0000. Clipped to the map rectangle (the AS mask).
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, MAP_W, MAP_H);
  ctx.clip();
  for (const m of state.measurements) {
    if (m.type === 'wedge') {
      // beginFill(0xFF0000, 8) + lineStyle(1,0xFF0000,40)
      ctx.beginPath();
      ctx.moveTo(m.ox, m.oy);
      ctx.lineTo(m.ox + MEASUREMENT_LEN * Math.cos(m.upper),
                 m.oy + MEASUREMENT_LEN * Math.sin(m.upper));
      ctx.lineTo(m.ox + MEASUREMENT_LEN * Math.cos(m.lower),
                 m.oy + MEASUREMENT_LEN * Math.sin(m.lower));
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,0,0,0.08)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,0,0,0.40)';
      ctx.stroke();
    } else {
      // lineStyle(1,0xFF0000,100) single ray
      ctx.beginPath();
      ctx.moveTo(m.ox, m.oy);
      ctx.lineTo(m.ox + MEASUREMENT_LEN * Math.cos(m.angle),
                 m.oy + MEASUREMENT_LEN * Math.sin(m.angle));
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,0,0,1)';
      ctx.stroke();
    }
  }
  ctx.restore();

  // 3. Labelled observer-position markers (preset C: attachMovie loop).
  if (state.observerPositionsList.length > 0) {
    for (let i = 0; i < state.observerPositionsList.length; i++) {
      drawPositionMarker(ctx, state.observerPositionsList[i],
        String.fromCharCode(65 + i));
    }
  }

  // 4. Boat (reused orange top-view art), when visible.
  if (state.boatVisible) {
    ctx.drawImage(images.boatTop,
      state.boat.x - REG.boatTop.x, state.boat.y - REG.boatTop.y);
  }

  // 5. Ruler (reused art), when shown -- registration is bottom-left on road.
  if (state.showRuler) {
    ctx.drawImage(images.ruler,
      state.rulerX - REG.ruler.x, OBSERVER_Y - REG.ruler.y);
    drawRulerNumbers(ctx);
  }

  // 6. Observer marker (reused red X) + directional arrows (code-drawn).
  ctx.drawImage(images.observerX,
    state.observerX - REG.observerX.x, OBSERVER_Y - REG.observerX.y);
  drawObserverArrows(ctx);

  ctx.restore();
}

// Ruler gradation numbers (1..11), drawn at the major ticks. These were an
// embedded-font text field in the Flash ruler sprite (verbatim digits from
// texts/169..179), not part of the exported vector art, so they are redrawn
// here. Major divisions are every 40 px (= 1 ruler unit = 20 m); the ruler's
// bottom sits on the road at OBSERVER_Y, numbers increasing upward.
function drawRulerNumbers(ctx) {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.font = '11px Verdana, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let n = 1; n <= 11; n++) {
    ctx.fillText(String(n), state.rulerX + 27, OBSERVER_Y - 40 * n);
  }
  ctx.restore();
}

// Small labelled marker for the preset-C observer positions.
function drawPositionMarker(ctx, x, label) {
  ctx.save();
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, OBSERVER_Y - 9);
  ctx.lineTo(x, OBSERVER_Y + 9);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, x, OBSERVER_Y - 11);
  ctx.restore();
}

// Left/right red arrows either side of the observer, shown when it can move
// in that direction (mirrors observerOnRollOver, but always visible so there
// is no hover-only affordance).
function drawObserverArrows(ctx) {
  let canLeft, canRight;
  const list = state.observerPositionsList;
  if (list.length > 0) {
    canLeft = list.some(p => p < state.observerX);
    canRight = list.some(p => p > state.observerX);
  } else {
    canLeft = state.observerX > OBSERVER_LEFT;
    canRight = state.observerX < OBSERVER_RIGHT;
  }
  ctx.save();
  ctx.fillStyle = '#ea351f';
  const y = OBSERVER_Y;
  if (canLeft) {
    const ax = state.observerX - 13;
    ctx.beginPath();
    ctx.moveTo(ax - 6, y); ctx.lineTo(ax, y - 5); ctx.lineTo(ax, y + 5);
    ctx.closePath(); ctx.fill();
  }
  if (canRight) {
    const ax = state.observerX + 13;
    ctx.beginPath();
    ctx.moveTo(ax + 6, y); ctx.lineTo(ax, y - 5); ctx.lineTo(ax, y + 5);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ===========================================================================
// OBSERVER'S VIEW rendering (parallax) -- from View Window.as
//   angle = atan2(-(boatY - observerY), boatX - observerX)
//   backgroundMC._x = (angle - PI/2) * stripScale
// The near boat stays centred; the far panorama shifts behind it.
// ===========================================================================
function drawView() {
  const ctx = viewCtx;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // Clip to the viewport (the View Window mask).
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  ctx.clip();

  // Viewing angle from the observer to the boat (screen-Y-down negated, per AS).
  const dx = state.boat.x - state.observerX;
  const dy = -(state.boat.y - OBSERVER_Y);
  const angle = Math.atan2(dy, dx);

  // Panorama left edge: constant term centres the strip at angle = PI/2,
  // then the AS shift term applies. Drawn at native width so the horizontal
  // stripScale mapping stays exact; stretched vertically to fill the viewport.
  const bgLeft = (VIEW_CX - STRIP_W / 2) + (angle - HALF_PI) * STRIP_SCALE;
  ctx.drawImage(images.panorama, 0, 0, STRIP_W, STRIP_H,
    bgLeft, 0, STRIP_W, VIEW_H);

  // Boat: centred, sized/placed by z = (boatY - 30) / 370  (from onPresetSelected).
  const z = (state.boat.y - 30) / 370;
  const boatY = V_TOP_BOAT + z * (V_BOT_BOAT - V_TOP_BOAT);
  const scale = (V_MIN_SCALE + z * (V_MAX_SCALE - V_MIN_SCALE)) / 100;
  const img = images.boatSide;
  ctx.save();
  ctx.translate(VIEW_CX, boatY);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -REG.boatSide.x, -REG.boatSide.y);
  ctx.restore();

  ctx.restore();
}

// ===========================================================================
// Screen-reader helpers
// ===========================================================================
let liveTimer = null;
function announce(msg) {
  // Debounce so drags/keys don't flood the live region.
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { el.live.textContent = msg; }, 120);
}

function updateMapDescription() {
  const parts = [];
  parts.push('Top-down map of a lake with a road along the bottom edge.');
  parts.push(state.boatVisible
    ? 'The boat is visible on the lake.'
    : 'The boat is hidden.');
  parts.push('The observer marker is at ' +
    Math.round(state.observerX * METERS_PER_PX) + ' meters along the road.');
  if (state.observerPositionsList.length > 0) {
    parts.push('Fixed observer positions are marked ' +
      state.observerPositionsList.map((p, i) => String.fromCharCode(65 + i)).join(' and ') + '.');
  }
  const n = state.measurements.length;
  if (n > 0) parts.push(n + (n === 1 ? ' measurement sight line' : ' measurement sight lines') +
    ' drawn toward the boat.');
  if (state.showRuler) parts.push('The ruler is shown at ' +
    Math.round(state.rulerX * METERS_PER_PX) + ' meters.');
  el.mapDesc.textContent = parts.join(' ');
}

function updateViewDescription() {
  const dx = state.boat.x - state.observerX;
  const dy = -(state.boat.y - OBSERVER_Y);
  const bearing = Math.round(Math.atan2(dy, dx) / Math.PI * 180);
  el.viewDesc.textContent =
    "The observer's view: a distant panorama of hills behind the lake, with the " +
    'boat centred in the foreground. Bearing to the boat is ' + bearing +
    ' degrees. As the observer moves along the road, the boat appears to shift ' +
    'against the far hills, demonstrating parallax.';
}

// ===========================================================================
// Error slider / readout (MathJax-ready: routes through kl-unl.js when the
// deployment provides MathJax, otherwise shows the accessible text output).
// ===========================================================================
function updateErrorReadout() {
  const txt = fixed1(state.error);
  el.errorOut.textContent = txt + '°';
  el.error.setAttribute('aria-valuetext', 'error ' + txt + ' degrees');
  // MathJax hook -- no-op (and leaves the text output intact) when MathJax is
  // absent, per the foundation's kl-unl.js guard.
  if (window.MathJax && typeof klunlShowEquation === 'function') {
    klunlShowEquation(
      ['pe-error-eqn', '\\(' + txt + '^{\\circ}\\)'],
      ['pe-error-sr', 'error ' + txt + ' degrees']);
  }
}

// ===========================================================================
// Controller (from Parallax Explorer.as)
// ===========================================================================
function onPresetSelected(index, opts) {
  const p = PRESETS[index];
  state.presetIndex = index;

  state.showRuler = false;                          // showRulerCheckBox(false)
  state.boatVisible = p.showBoat;                   // boat visibility
  state.boat = { x: p.boatPosition.x, y: p.boatPosition.y };
  state.error = p.error;                            // errorSlider.value
  state.errorAdjustable = p.errorIsAdjustable;      // errorSlider.userEnabled
  state.observerX = p.observerPosition;
  state.observerPositionsList = p.observerPositionsList.slice();
  state.measurements = [];                          // mapMC.refresh() clears

  // Sync DOM controls
  el.preset.value = String(index);
  el.error.value = String(p.error);
  el.error.disabled = !p.errorIsAdjustable;
  el.showRuler.checked = false;
  el.ruler.hidden = true;
  updateErrorReadout();
  updateObserverProxy();
  updateRulerProxy();
  render();

  if (!opts || !opts.silent) {
    announce(p.name + ' selected. ' +
      (p.showBoat ? 'Boat visible. ' : 'Boat hidden. ') +
      'Error ' + fixed1(p.error) + ' degrees, ' +
      (p.errorIsAdjustable ? 'adjustable.' : 'fixed.'));
  }
}

// ===========================================================================
// Observer & ruler positioning (drag + keyboard share this)
// ===========================================================================
function setObserverX(x, announceMove) {
  x = clamp(x, OBSERVER_LEFT, OBSERVER_RIGHT);
  // Snap to nearest fixed position when a list is present (Map.as).
  const list = state.observerPositionsList;
  let snappedLabel = null;
  if (list.length > 0) {
    let best = Infinity, chosen = x, idx = -1;
    for (let i = 0; i < list.length; i++) {
      const d = Math.abs(x - list[i]);
      if (d < best) { best = d; chosen = list[i]; idx = i; }
    }
    x = chosen;
    snappedLabel = String.fromCharCode(65 + idx);
  }
  state.observerX = x;
  updateObserverProxy();
  render();
  if (announceMove) {
    announce('Observer at ' + Math.round(x * METERS_PER_PX) + ' meters along the road' +
      (snappedLabel ? ', position ' + snappedLabel + '.' : '.'));
  }
}

function setRulerX(x, announceMove) {
  x = clamp(x, RULER_LEFT, RULER_RIGHT);
  state.rulerX = x;
  updateRulerProxy();
  render();
  if (announceMove) {
    announce('Ruler at horizontal position ' +
      Math.round(x * METERS_PER_PX) + ' meters.');
  }
}

function updateObserverProxy() {
  const px = state.observerX;
  const meters = Math.round(px * METERS_PER_PX);
  el.observer.setAttribute('aria-valuenow', String(meters));
  el.observer.setAttribute('aria-valuetext',
    'Observer position ' + meters + ' meters along the road');
  // Position the focus proxy over the marker (percentages track canvas scale).
  el.observer.style.left = (px / MAP_W * 100) + '%';
  el.observer.style.top = (OBSERVER_Y / MAP_H * 100) + '%';
}

function updateRulerProxy() {
  const px = state.rulerX;
  const meters = Math.round(px * METERS_PER_PX);
  el.ruler.setAttribute('aria-valuenow', String(meters));
  el.ruler.setAttribute('aria-valuetext',
    'Ruler at horizontal position ' + meters + ' meters');
  // The ruler art is drawn from its bottom-left registration point at
  // (rulerX - REG.ruler.x); align the proxy's left edge to the same spot so the
  // focus ring frames the ruler (proxy width is set in CSS to the art width).
  el.ruler.style.left = ((px - REG.ruler.x) / MAP_W * 100) + '%';
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ===========================================================================
// Pointer drag on the map canvas (mouse + touch via Pointer Events)
// ===========================================================================
let drag = null; // { target: 'observer'|'ruler', offset }

function canvasPointFromEvent(ev) {
  const rect = el.mapCanvas.getBoundingClientRect();
  const sx = MAP_W / rect.width;
  const sy = MAP_H / rect.height;
  return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
}

function hitTest(pt) {
  // Ruler first (it sits on top when shown). The ruler art spans roughly
  // rulerX-0.55 .. rulerX+44.65 (bottom-left registration), so test around its
  // centre (rulerX + ~22) across the full ruler height.
  if (state.showRuler &&
      Math.abs(pt.x - (state.rulerX + 22)) <= 26 && pt.y <= OBSERVER_Y + 8) {
    return 'ruler';
  }
  // Observer marker (generous target around the red X on the road).
  if (Math.abs(pt.x - state.observerX) <= 22 &&
      Math.abs(pt.y - OBSERVER_Y) <= 26) {
    return 'observer';
  }
  return null;
}

function onMapPointerDown(ev) {
  const pt = canvasPointFromEvent(ev);
  const target = hitTest(pt);
  if (!target) return;
  ev.preventDefault();
  el.mapCanvas.setPointerCapture(ev.pointerId);
  if (target === 'ruler') {
    drag = { target, offset: state.rulerX - pt.x };
    el.ruler.focus();          // click-to-focus
  } else {
    drag = { target, offset: state.observerX - pt.x };
    el.observer.focus();       // click-to-focus
  }
}

function onMapPointerMove(ev) {
  if (!drag) return;
  const pt = canvasPointFromEvent(ev);
  if (drag.target === 'ruler') setRulerX(pt.x + drag.offset, true);
  else setObserverX(pt.x + drag.offset, true);
}

function onMapPointerUp(ev) {
  if (!drag) return;
  try { el.mapCanvas.releasePointerCapture(ev.pointerId); } catch (e) {}
  drag = null;
}

// ===========================================================================
// Keyboard control for the draggable proxies
// ===========================================================================
function observerKey(ev) {
  const list = state.observerPositionsList;
  const step = 2, page = 20;
  let handled = true;
  if (list.length > 0) {
    // Move between fixed positions.
    const sorted = [...list].sort((a, b) => a - b);
    let i = sorted.indexOf(state.observerX);
    if (i < 0) i = 0;
    switch (ev.key) {
      case 'ArrowLeft': case 'ArrowDown': i = Math.max(0, i - 1); break;
      case 'ArrowRight': case 'ArrowUp': i = Math.min(sorted.length - 1, i + 1); break;
      case 'Home': i = 0; break;
      case 'End': i = sorted.length - 1; break;
      default: handled = false;
    }
    if (handled) setObserverX(sorted[i], true);
  } else {
    let x = state.observerX;
    switch (ev.key) {
      case 'ArrowLeft': case 'ArrowDown': x -= step; break;
      case 'ArrowRight': case 'ArrowUp': x += step; break;
      case 'PageDown': x -= page; break;
      case 'PageUp': x += page; break;
      case 'Home': x = OBSERVER_LEFT; break;
      case 'End': x = OBSERVER_RIGHT; break;
      default: handled = false;
    }
    if (handled) setObserverX(x, true);
  }
  if (handled) ev.preventDefault();
}

function rulerKey(ev) {
  const step = 2, page = 20;
  let x = state.rulerX, handled = true;
  switch (ev.key) {
    case 'ArrowLeft': case 'ArrowDown': x -= step; break;
    case 'ArrowRight': case 'ArrowUp': x += step; break;
    case 'PageDown': x -= page; break;
    case 'PageUp': x += page; break;
    case 'Home': x = RULER_LEFT; break;
    case 'End': x = RULER_RIGHT; break;
    default: handled = false;
  }
  if (handled) { setRulerX(x, true); ev.preventDefault(); }
}

// ===========================================================================
// Master render
// ===========================================================================
function render() {
  drawMap();
  drawView();
  updateMapDescription();
  updateViewDescription();
}

// ===========================================================================
// Canvas sizing (native backing size * devicePixelRatio, CSS-scaled to fit)
// ===========================================================================
function setupCanvas(canvas, w, h) {
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  return ctx;
}

// ===========================================================================
// Init
// ===========================================================================
function cacheDom() {
  el.mapStage = document.getElementById('pe-map-stage');
  el.mapCanvas = document.getElementById('pe-map-canvas');
  el.viewCanvas = document.getElementById('pe-view-canvas');
  el.mapDesc = document.getElementById('pe-map-desc');
  el.viewDesc = document.getElementById('pe-view-desc');
  el.observer = document.getElementById('pe-observer');
  el.ruler = document.getElementById('pe-ruler');
  el.preset = document.getElementById('pe-preset');
  el.error = document.getElementById('pe-error');
  el.errorOut = document.getElementById('pe-error-out');
  el.take = document.getElementById('pe-take');
  el.clear = document.getElementById('pe-clear');
  el.showRuler = document.getElementById('pe-show-ruler');
  el.live = document.getElementById('pe-live');
}

function wireEvents() {
  // Presets
  el.preset.addEventListener('change', () => onPresetSelected(Number(el.preset.value)));

  // Error slider
  el.error.addEventListener('input', () => {
    state.error = Number(el.error.value);
    updateErrorReadout();
    render();
  });
  el.error.addEventListener('change', () => {
    announce('Error set to ' + fixed1(state.error) + ' degrees.');
  });

  // Buttons
  el.take.addEventListener('click', takeMeasurement);
  el.clear.addEventListener('click', clearMeasurements);

  // Show ruler
  el.showRuler.addEventListener('change', () => {
    state.showRuler = el.showRuler.checked;
    el.ruler.hidden = !state.showRuler;
    render();
    announce(state.showRuler ? 'Ruler shown.' : 'Ruler hidden.');
  });

  // Map pointer drag
  el.mapCanvas.addEventListener('pointerdown', onMapPointerDown);
  el.mapCanvas.addEventListener('pointermove', onMapPointerMove);
  el.mapCanvas.addEventListener('pointerup', onMapPointerUp);
  el.mapCanvas.addEventListener('pointercancel', onMapPointerUp);

  // Keyboard for proxies
  el.observer.addEventListener('keydown', observerKey);
  el.ruler.addEventListener('keydown', rulerKey);

  // Masthead Reset -> exact initial state (Preset A).
  document.addEventListener('sim-reset', () => {
    onPresetSelected(0);
    announce('Simulation reset. Preset A restored.');
  });
}

// Redefine the foundation's equation initializer (called on load by kl-unl.js).
window.klunlInitEqn = function () { updateErrorReadout(); };

// User-requested masthead tweak: raise the blue bottom border a little by
// trimming the container's bottom padding. Applied as a scoped style injected
// into the masthead's (open) shadow root at runtime -- the foundation files
// themselves are left byte-for-byte unchanged. The masthead renders its shadow
// asynchronously (it fetches contents.json first), so poll briefly for it.
function raiseMastheadRule() {
  const host = document.querySelector('kl-unl-masthead');
  if (!host || !host.shadowRoot) return false;
  const container = host.shadowRoot.querySelector('.masthead-container');
  if (!container) return false;
  if (host.shadowRoot.getElementById('pe-mh-tweak')) return true;
  const style = document.createElement('style');
  style.id = 'pe-mh-tweak';
  style.textContent = '.masthead-container{padding-bottom:4px;}';
  host.shadowRoot.appendChild(style);
  return true;
}
(function pollMastheadTweak(tries) {
  if (raiseMastheadRule() || tries <= 0) return;
  setTimeout(() => pollMastheadTweak(tries - 1), 100);
})(30);

async function init() {
  cacheDom();
  mapCtx = setupCanvas(el.mapCanvas, MAP_W, MAP_H);
  viewCtx = setupCanvas(el.viewCanvas, VIEW_W, VIEW_H);

  try {
    await loadAssets();
  } catch (e) {
    console.error(e);
    el.mapDesc.textContent = 'Error: simulation artwork failed to load.';
    return;
  }

  wireEvents();
  onPresetSelected(0, { silent: true }); // initial state, no announcement
  updateViewDescription();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
