export var defaults = {
  liveCellColor: '#ffffff',
  deadCellColor: '#000000',
  cellsPerRow: 50,
  renderSpeedFps: 12,
  runningState: 'stopped',
  startingGen: 'random',
  clickTap: 'revive',
};

export var maxCellsPerRow = 100;

var MIN_SIDE = 3;
var SURVIVE_COUNTS = [5, 6, 7];
var BIRTH_COUNTS = [6, 7];

var SURVIVE = new Uint8Array(27);
var BIRTH = new Uint8Array(27);
SURVIVE_COUNTS.forEach(function (c) {
  SURVIVE[c] = 1;
});
BIRTH_COUNTS.forEach(function (c) {
  BIRTH[c] = 1;
});

var VIEW_HEIGHT_FRACTION = 0.8;
var DEFAULT_CAMERA = { yaw: 0.6, pitch: 0.5, zoom: 1 };
var cam = { yaw: DEFAULT_CAMERA.yaw, pitch: DEFAULT_CAMERA.pitch, zoom: 1 };

var simStates;
var getCurrentSim;
var getCanvas;
var saveStateToStorage;
var applyStateToUI;
var pauseSimulation;
var runSimulation;
var setAnimFrame;
var updateCanvasLayout;

var startingGen3dContainer = document.getElementById('starting-gen-3d');
var clickTap3dContainer = document.getElementById('click-tap-3d');
var rowSizeInput3d = document.getElementById('row-size-3d');
var rowSizeVal3d = document.getElementById('row-size-val-3d');

export function init(ctx) {
  simStates = ctx.simStates;
  getCurrentSim = ctx.getCurrentSim;
  getCanvas = ctx.getCanvas;
  saveStateToStorage = ctx.saveStateToStorage;
  applyStateToUI = ctx.applyStateToUI;
  pauseSimulation = ctx.pauseSimulation;
  runSimulation = ctx.runSimulation;
  setAnimFrame = ctx.setAnimFrame;
  updateCanvasLayout = ctx.updateCanvasLayout;
}

function createLife(n) {
  var size = n * n * n;
  var pos = new Int32Array(size);
  pos.fill(-1);
  var wrapPrev = new Int32Array(n);
  var wrapNext = new Int32Array(n);
  for (var i = 0; i < n; i++) {
    wrapPrev[i] = i === 0 ? n - 1 : i - 1;
    wrapNext[i] = i === n - 1 ? 0 : i + 1;
  }
  return {
    n: n,
    live: new Int32Array(size),
    next: new Int32Array(size),
    liveCount: 0,
    pos: pos,
    counts: new Uint8Array(size),
    touched: new Int32Array(size),
    wrapPrev: wrapPrev,
    wrapNext: wrapNext,
    zo: new Int32Array(3),
    yo: new Int32Array(3),
    xs: new Int32Array(3),
  };
}

function setCell(life, x, y, z, value) {
  var n = life.n;
  if (x < 0 || x >= n || y < 0 || y >= n || z < 0 || z >= n) return;
  var k = x + n * (y + n * z);
  var idx = life.pos[k];
  if (value) {
    if (idx < 0) {
      life.pos[k] = life.liveCount;
      life.live[life.liveCount++] = k;
    }
  } else if (idx >= 0) {
    var last = life.live[--life.liveCount];
    life.live[idx] = last;
    life.pos[last] = idx;
    life.pos[k] = -1;
  }
}

function resizeLife(old, n) {
  var life = createLife(n);
  var off = Math.floor((old.n - n) / 2);
  var on = old.n;
  var nn = on * on;
  for (var i = 0; i < old.liveCount; i++) {
    var k = old.live[i];
    var z = (k / nn) | 0;
    var rem = k - z * nn;
    var y = (rem / on) | 0;
    var x = rem - y * on;
    setCell(life, x - off, y - off, z - off, 1);
  }
  return life;
}

function seedCubeSoup(life, side, density) {
  var n = life.n;
  var lo = Math.floor((n - side) / 2);
  for (var z = lo; z < lo + side; z++)
    for (var y = lo; y < lo + side; y++)
      for (var x = lo; x < lo + side; x++)
        if (Math.random() < density) setCell(life, x, y, z, 1);
}

function seedBlobs(life, count, radius, density) {
  var n = life.n;
  for (var b = 0; b < count; b++) {
    var cx = Math.floor(Math.random() * n);
    var cy = Math.floor(Math.random() * n);
    var cz = Math.floor(Math.random() * n);
    for (var dz = -radius; dz <= radius; dz++)
      for (var dy = -radius; dy <= radius; dy++)
        for (var dx = -radius; dx <= radius; dx++)
          if (
            dx * dx + dy * dy + dz * dz <= radius * radius &&
            Math.random() < density
          )
            setCell(life, cx + dx, cy + dy, cz + dz, 1);
  }
}

function seedVolumeSoup(life, density) {
  var n = life.n;
  for (var z = 0; z < n; z++)
    for (var y = 0; y < n; y++)
      for (var x = 0; x < n; x++)
        if (Math.random() < density) setCell(life, x, y, z, 1);
}

function seedSlab(life, thickness, density) {
  var n = life.n;
  var lo = Math.floor((n - thickness) / 2);
  for (var z = 0; z < n; z++)
    for (var y = lo; y < lo + thickness; y++)
      for (var x = 0; x < n; x++)
        if (Math.random() < density) setCell(life, x, y, z, 1);
}

function init3dGrid(canvas, n, config) {
  var life = createLife(n);
  if (config.startingGen === 'random') {
    var style = Math.floor(Math.random() * 4);
    if (style === 0) {
      // Centered cube of soup
      var side = Math.max(3, Math.round(n * (0.3 + Math.random() * 0.3)));
      seedCubeSoup(life, side, SEED_CUBE_DENSITY());
    } else if (style === 1) {
      // Several spherical blobs
      var radius = Math.max(2, Math.round(n * (0.1 + Math.random() * 0.1)));
      seedBlobs(
        life,
        2 + Math.floor(Math.random() * 4),
        radius,
        SEED_BLOB_DENSITY(),
      );
    } else if (style === 2) {
      // Sparse soup through the whole volume
      seedVolumeSoup(life, SEED_VOLUME_DENSITY());
    } else if (style === 3) {
      // Horizontal slab
      var thickness = Math.max(2, Math.round(n * (0.08 + Math.random() * 0.1)));
      seedSlab(life, thickness, SEED_SLAB_DENSITY());
    }
  }
  canvas._life3d = life;

  attach3dInteraction(canvas);
  draw3d(canvas);
}
function SEED_CUBE_DENSITY() {
  return 0.2 + Math.random() * 0.1;
}
function SEED_BLOB_DENSITY() {
  return 0.2 + Math.random() * 0.1;
}
function SEED_VOLUME_DENSITY() {
  return 0.1 + Math.random() * 0.05;
}
function SEED_SLAB_DENSITY() {
  return 0.2 + Math.random() * 0.1;
}

function step3d(canvas) {
  var life = canvas._life3d;
  if (!life) return;

  var n = life.n,
    nn = n * n;
  var live = life.live,
    next = life.next,
    count = life.liveCount;
  var pos = life.pos,
    counts = life.counts,
    touched = life.touched;
  var wp = life.wrapPrev,
    wn = life.wrapNext;
  var zo = life.zo,
    yo = life.yo,
    xs = life.xs;
  var nt = 0;
  var i, k;

  for (i = 0; i < count; i++) {
    k = live[i];
    var z = (k / nn) | 0;
    var rem = k - z * nn;
    var y = (rem / n) | 0;
    var x = rem - y * n;

    zo[0] = wp[z] * nn;
    zo[1] = z * nn;
    zo[2] = wn[z] * nn;
    yo[0] = wp[y] * n;
    yo[1] = y * n;
    yo[2] = wn[y] * n;
    xs[0] = wp[x];
    xs[1] = x;
    xs[2] = wn[x];

    for (var a = 0; a < 3; a++) {
      for (var b = 0; b < 3; b++) {
        var base = zo[a] + yo[b];
        for (var c = 0; c < 3; c++) {
          if (a === 1 && b === 1 && c === 1) continue;
          var nk = base + xs[c];
          if (counts[nk]++ === 0) touched[nt++] = nk;
        }
      }
    }
  }

  var nx = 0;
  for (i = 0; i < nt; i++) {
    k = touched[i];
    var cnt = counts[k];
    counts[k] = 0;
    if (pos[k] >= 0 ? SURVIVE[cnt] : BIRTH[cnt]) next[nx++] = k;
  }

  for (i = 0; i < count; i++) pos[live[i]] = -1;
  for (i = 0; i < nx; i++) pos[next[i]] = i;

  life.live = next;
  life.next = live;
  life.liveCount = nx;
}

function parseHex(hex) {
  if (hex.indexOf('#') === 0) hex = hex.slice(1);
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function packRgb(r, g, b) {
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

function mixPacked(bg, fg, t) {
  return packRgb(
    (bg[0] + (fg[0] - bg[0]) * t) | 0,
    (bg[1] + (fg[1] - bg[1]) * t) | 0,
    (bg[2] + (fg[2] - bg[2]) * t) | 0,
  );
}

function getBuffers3d(canvas) {
  var width = canvas.width,
    height = canvas.height;
  var imageData = canvas._imageData3d;
  if (!imageData || imageData.width !== width || imageData.height !== height) {
    imageData = canvas.getContext('2d').createImageData(width, height);
    canvas._imageData3d = imageData;
    canvas._pixels32_3d = new Uint32Array(imageData.data.buffer);
    canvas._zbuf3d = new Float32Array(width * height);
  }
  return imageData;
}

function getView(canvas, n) {
  var R = (n * Math.sqrt(3)) / 2;
  var D0 = R * 3;
  var minDim = Math.min(canvas.width, canvas.height);
  return {
    n: n,
    R: R,
    D: D0 / cam.zoom,
    F: (0.45 * minDim * Math.sqrt(D0 * D0 - R * R)) / R,
    cx: canvas.width / 2,
    cy: canvas.height / 2,
    cyw: Math.cos(cam.yaw),
    syw: Math.sin(cam.yaw),
    cpt: Math.cos(cam.pitch),
    spt: Math.sin(cam.pitch),
  };
}

function draw3d(canvas) {
  var life = canvas._life3d;
  if (!life) return;

  var n = life.n,
    nn = n * n,
    half = n / 2;
  var width = canvas.width,
    height = canvas.height;
  var ctx = canvas.getContext('2d');
  var imageData = getBuffers3d(canvas);
  var pixels = canvas._pixels32_3d;
  var zbuf = canvas._zbuf3d;

  var liveRgb = parseHex(simStates['3d'].liveCellColor);
  var deadRgb = parseHex(simStates['3d'].deadCellColor);
  pixels.fill(packRgb(deadRgb[0], deadRgb[1], deadRgb[2]));
  zbuf.fill(Infinity);

  var v = getView(canvas, n);
  var D = v.D,
    F = v.F,
    cx = v.cx,
    cy = v.cy;
  var cyw = v.cyw,
    syw = v.syw,
    cpt = v.cpt,
    spt = v.spt;
  var dNear = D - v.R;
  var span = 2 * v.R;
  var live = life.live;

  for (var i = 0; i < life.liveCount; i++) {
    var k = live[i];
    var z = (k / nn) | 0;
    var rem = k - z * nn;
    var y = (rem / n) | 0;
    var x = rem - y * n;

    var px = x + 0.5 - half;
    var py = y + 0.5 - half;
    var pz = z + 0.5 - half;

    var x1 = px * cyw + pz * syw;
    var z1 = -px * syw + pz * cyw;
    var y2 = py * cpt - z1 * spt;
    var z2 = py * spt + z1 * cpt;

    var d = D + z2;
    var f = F / d;
    var size = Math.max(1, Math.round(f >= 6 ? f - 1 : f));
    var x0 = Math.round(cx + x1 * f - f / 2);
    var y0 = Math.round(cy + y2 * f - f / 2);

    var xa = x0 < 0 ? 0 : x0;
    var xb = x0 + size > width ? width : x0 + size;
    var ya = y0 < 0 ? 0 : y0;
    var yb = y0 + size > height ? height : y0 + size;
    if (xa >= xb || ya >= yb) continue;

    var t = (d - dNear) / span;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var shade = 1 - 0.7 * t;
    var face = mixPacked(deadRgb, liveRgb, shade);
    var edge = mixPacked(deadRgb, liveRgb, shade * 0.5);
    var useEdge = size >= 4;
    var lastX = x0 + size - 1,
      lastY = y0 + size - 1;

    for (var yy = ya; yy < yb; yy++) {
      var row = yy * width;
      var edgeRow = useEdge && yy === lastY;
      for (var xx = xa; xx < xb; xx++) {
        var idx = row + xx;
        if (d < zbuf[idx]) {
          zbuf[idx] = d;
          pixels[idx] = edgeRow || (useEdge && xx === lastX) ? edge : face;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  drawOverlay3d(canvas, ctx, v, liveRgb);
}

function drawOverlay3d(canvas, ctx, v, liveRgb) {
  var h = v.n / 2;
  var corners = [];
  for (var i = 0; i < 8; i++) {
    var px = i & 1 ? h : -h;
    var py = i & 2 ? h : -h;
    var pz = i & 4 ? h : -h;
    var x1 = px * v.cyw + pz * v.syw;
    var z1 = -px * v.syw + pz * v.cyw;
    var y2 = py * v.cpt - z1 * v.spt;
    var z2 = py * v.spt + z1 * v.cpt;
    var f = v.F / (v.D + z2);
    corners.push([v.cx + x1 * f, v.cy + y2 * f]);
  }
  var rgb = liveRgb.join(',');
  ctx.strokeStyle = 'rgba(' + rgb + ',0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var a = 0; a < 8; a++) {
    for (var bit = 1; bit <= 4; bit <<= 1) {
      var b = a | bit;
      if (b !== a) {
        ctx.moveTo(corners[a][0], corners[a][1]);
        ctx.lineTo(corners[b][0], corners[b][1]);
      }
    }
  }
  ctx.stroke();

  var state = simStates['3d'];
  var canPaint =
    state.runningState === 'running' || state.startingGen === 'custom';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(' + rgb + ',0.6)';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    canPaint
      ? 'Click/tap to paint \u00b7 Right-drag or Shift-drag to rotate \u00b7 Scroll/pinch to zoom'
      : 'Drag to rotate \u00b7 Scroll/pinch to zoom',
    10,
    canvas.height - 8,
  );
}

function pickCell3d(canvas, life, sx, sy, kill, stroke) {
  var v = getView(canvas, life.n);
  var n = life.n;

  function toWorld(x, y, z) {
    var y1 = y * v.cpt + z * v.spt;
    var z1 = -y * v.spt + z * v.cpt;
    return [x * v.cyw - z1 * v.syw, y1, x * v.syw + z1 * v.cyw];
  }
  var half = n / 2;
  var o = toWorld(0, 0, -v.D);
  var dir = toWorld((sx - v.cx) / v.F, (sy - v.cy) / v.F, 1);
  o = [o[0] + half, o[1] + half, o[2] + half];

  var tEnter = 0,
    tExit = Infinity;
  for (var ax = 0; ax < 3; ax++) {
    if (Math.abs(dir[ax]) < 1e-12) {
      if (o[ax] < 0 || o[ax] > n) return null;
    } else {
      var t1 = (0 - o[ax]) / dir[ax];
      var t2 = (n - o[ax]) / dir[ax];
      if (t1 > t2) {
        var tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tEnter) tEnter = t1;
      if (t2 < tExit) tExit = t2;
    }
  }
  if (tEnter > tExit) return null;

  var t0 = tEnter + 1e-7;
  var cell = [0, 0, 0],
    step = [0, 0, 0],
    tMax = [0, 0, 0],
    tDelta = [0, 0, 0];
  for (var a = 0; a < 3; a++) {
    var p = o[a] + dir[a] * t0;
    cell[a] = Math.min(n - 1, Math.max(0, Math.floor(p)));
    if (dir[a] > 0) {
      step[a] = 1;
      tMax[a] = (cell[a] + 1 - o[a]) / dir[a];
      tDelta[a] = 1 / dir[a];
    } else if (dir[a] < 0) {
      step[a] = -1;
      tMax[a] = (cell[a] - o[a]) / dir[a];
      tDelta[a] = -1 / dir[a];
    } else {
      step[a] = 0;
      tMax[a] = Infinity;
      tDelta[a] = Infinity;
    }
  }

  var prev = null,
    floorCell = null,
    hit = null;
  for (var iter = 0; iter < 3 * n + 3; iter++) {
    var k = cell[0] + n * (cell[1] + n * cell[2]);
    if (life.pos[k] >= 0 && !(stroke && stroke.has(k))) {
      hit = cell.slice();
      break;
    }
    if (cell[1] === n - 1 && !floorCell) floorCell = cell.slice();
    prev = cell.slice();

    var m =
      tMax[0] < tMax[1]
        ? tMax[0] < tMax[2]
          ? 0
          : 2
        : tMax[1] < tMax[2]
          ? 1
          : 2;
    cell[m] += step[m];
    tMax[m] += tDelta[m];
    if (cell[m] < 0 || cell[m] >= n) break;
  }

  if (kill) return hit;
  if (hit) return prev;
  return floorCell;
}

function attach3dInteraction(canvas) {
  if (canvas._interaction3dAttached) return;
  canvas._interaction3dAttached = true;

  var painting = false;
  var orbiting = false;
  var wasRunningBeforePaint = false;
  var lastX = 0,
    lastY = 0;
  var gesture = null;
  var stroke = new Set();

  function clampCam() {
    cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch));
    cam.zoom = Math.max(0.5, Math.min(2.2, cam.zoom));
  }

  function toCanvas(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * canvas.width) / (rect.width || canvas.width),
      y:
        ((clientY - rect.top) * canvas.height) / (rect.height || canvas.height),
    };
  }

  function paint(clientX, clientY) {
    var life = canvas._life3d;
    if (!life) return;
    var pt = toCanvas(clientX, clientY);
    var kill = simStates['3d'].clickTap === 'kill';
    var c = pickCell3d(canvas, life, pt.x, pt.y, kill, stroke);
    if (!c) return;
    setCell(life, c[0], c[1], c[2], kill ? 0 : 1);
    if (!kill) stroke.add(c[0] + life.n * (c[1] + life.n * c[2]));
    draw3d(canvas);
  }

  function orbit(dx, dy) {
    cam.yaw -= dx * 0.01;
    cam.pitch += dy * 0.01;
    clampCam();
    draw3d(canvas);
  }

  function beginStroke(clientX, clientY, forceOrbit) {
    var isCustom = simStates['3d'].startingGen === 'custom';
    wasRunningBeforePaint =
      simStates[getCurrentSim()].runningState === 'running';

    if (forceOrbit || !(wasRunningBeforePaint || isCustom)) {
      orbiting = true;
      wasRunningBeforePaint = false;
      lastX = clientX;
      lastY = clientY;
      return;
    }
    if (wasRunningBeforePaint && !isCustom) pauseSimulation();
    painting = true;
    stroke.clear();
    paint(clientX, clientY);
  }

  function endStroke() {
    orbiting = false;
    var wasPainting = painting;
    painting = false;
    stroke.clear();
    if (
      wasPainting &&
      wasRunningBeforePaint &&
      simStates['3d'].startingGen !== 'custom'
    ) {
      simStates[getCurrentSim()].runningState = 'running';
      runSimulation();
    }
    wasRunningBeforePaint = false;
  }

  canvas.addEventListener('contextmenu', e => {
    if (getCurrentSim() === '3d') e.preventDefault();
  });

  canvas.addEventListener('mousedown', e => {
    if (getCurrentSim() !== '3d') return;
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    beginStroke(e.clientX, e.clientY, e.button === 2 || e.shiftKey);
  });

  canvas.addEventListener('mousemove', e => {
    if (getCurrentSim() !== '3d') return;
    if (orbiting) {
      orbit(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (painting) {
      paint(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (getCurrentSim() !== '3d') return;
    endStroke();
  });

  canvas.addEventListener('mouseleave', () => {
    if (getCurrentSim() !== '3d') return;
    endStroke();
  });

  canvas.addEventListener(
    'wheel',
    e => {
      if (getCurrentSim() !== '3d') return;
      e.preventDefault();
      cam.zoom *= Math.exp(-e.deltaY * 0.001);
      clampCam();
      draw3d(canvas);
    },
    { passive: false },
  );

  function touchInfo(e) {
    var a = e.touches[0],
      b = e.touches[1];
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    };
  }

  canvas.addEventListener(
    'touchstart',
    e => {
      if (getCurrentSim() !== '3d') return;
      if (e.touches.length >= 2) {
        if (painting || orbiting) endStroke();
        gesture = touchInfo(e);
        e.preventDefault();
        return;
      }
      beginStroke(e.touches[0].clientX, e.touches[0].clientY, false);
      if (painting || orbiting) e.preventDefault();
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    e => {
      if (getCurrentSim() !== '3d') return;
      if (gesture && e.touches.length >= 2) {
        e.preventDefault();
        var g = touchInfo(e);
        cam.yaw -= (g.x - gesture.x) * 0.01;
        cam.pitch += (g.y - gesture.y) * 0.01;
        if (gesture.dist > 0) cam.zoom *= g.dist / gesture.dist;
        clampCam();
        gesture = g;
        draw3d(canvas);
        return;
      }
      if (!e.touches.length) return;
      var t = e.touches[0];
      if (orbiting) {
        e.preventDefault();
        orbit(t.clientX - lastX, t.clientY - lastY);
        lastX = t.clientX;
        lastY = t.clientY;
      } else if (painting) {
        e.preventDefault();
        paint(t.clientX, t.clientY);
      }
    },
    { passive: false },
  );

  canvas.addEventListener('touchend', e => {
    if (getCurrentSim() !== '3d') return;
    if (gesture) {
      if (e.touches.length < 2) gesture = null;
      return;
    }
    endStroke();
  });
}

export function layout(canvas, activeConfig, dims) {
  var height = Math.max(
    240,
    Math.round(window.innerHeight * VIEW_HEIGHT_FRACTION),
  );
  if (canvas.width !== dims.newWidth || canvas.height !== height) {
    canvas.width = dims.newWidth;
    canvas.height = height;
  }

  var n = Math.max(
    MIN_SIDE,
    Math.min(maxCellsPerRow, Math.round(activeConfig.cellsPerRow)),
  );
  var life = canvas._life3d;
  if (life) {
    if (life.n !== n) canvas._life3d = resizeLife(life, n);
    attach3dInteraction(canvas);
    draw3d(canvas);
  } else {
    init3dGrid(canvas, n, activeConfig);
  }
}

export function applyToUI(state) {
  if (rowSizeInput3d) rowSizeInput3d.value = state.cellsPerRow;
  if (rowSizeVal3d) rowSizeVal3d.textContent = `Current: ${state.cellsPerRow}`;

  if (clickTap3dContainer) {
    var r = clickTap3dContainer.querySelector(
      `input[value="${state.clickTap}"]`,
    );
    if (r) r.checked = true;
  }

  if (startingGen3dContainer) {
    var r = startingGen3dContainer.querySelector(
      `input[value="${state.startingGen}"]`,
    );
    if (r) r.checked = true;
  }
}

export function reset(canvas) {
  simStates['3d'] = { ...defaults };
  canvas._life3d = null;
  cam.yaw = DEFAULT_CAMERA.yaw;
  cam.pitch = DEFAULT_CAMERA.pitch;
  cam.zoom = DEFAULT_CAMERA.zoom;
}

export function run() {
  var lastTickTime3d = performance.now();
  var accumulatedTime3d = 0;

  function tick3d(currentTime) {
    if (simStates[getCurrentSim()].runningState !== 'running') return;

    var delta = currentTime - lastTickTime3d;
    lastTickTime3d = currentTime;

    var targetFps = simStates['3d'].renderSpeedFps;
    var fpsInterval = 1000 / targetFps;
    accumulatedTime3d += delta;

    if (accumulatedTime3d >= fpsInterval) {
      var gensPerFrame = Math.floor(accumulatedTime3d / fpsInterval);
      accumulatedTime3d %= fpsInterval;

      if (gensPerFrame > 5) {
        gensPerFrame = 5;
        accumulatedTime3d = 0;
      }

      var canvas = getCanvas();
      for (var i = 0; i < gensPerFrame; i++) {
        step3d(canvas);
      }
      draw3d(canvas);
    }
    setAnimFrame(requestAnimationFrame(tick3d));
  }
  setAnimFrame(requestAnimationFrame(tick3d));
}

export function bindControls() {
  if (startingGen3dContainer) {
    startingGen3dContainer.addEventListener('change', e => {
      simStates['3d'].startingGen = e.target.value;
      pauseSimulation();

      var canvas = getCanvas();
      canvas._life3d = null;

      saveStateToStorage();
      applyStateToUI();
    });
  }

  if (clickTap3dContainer) {
    clickTap3dContainer.addEventListener('change', e => {
      simStates['3d'].clickTap = e.target.value;
      saveStateToStorage();
    });
  }

  if (rowSizeInput3d) {
    rowSizeInput3d.addEventListener('input', e => {
      if (rowSizeVal3d) rowSizeVal3d.textContent = `Current: ${e.target.value}`;
      simStates['3d'].cellsPerRow = parseInt(e.target.value, 10);

      saveStateToStorage();
      updateCanvasLayout();
    });
  }
}
