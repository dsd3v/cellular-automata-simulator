export var defaults = {
  liveCellColor: '#ffffff',
  deadCellColor: '#000000',
  cellsPerRow: 50,
  renderSpeedFps: 10,
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

var BOX_FIT = 0.98;
var MAX_ASPECT = 16;
var VIEW_HEIGHT_FRACTION = 0.97;
var DEFAULT_CAMERA = { yaw: 0.6, pitch: 0.5, zoom: 1 };
var cam = { yaw: DEFAULT_CAMERA.yaw, pitch: DEFAULT_CAMERA.pitch, zoom: 1 };

var fitCam = { yaw: DEFAULT_CAMERA.yaw, pitch: DEFAULT_CAMERA.pitch };
var camTouched = false;

function autoCamera(aspect) {
  var t1 = Math.max(0, Math.min(1, (aspect - 1.2) / 1.8));
  var t2 = Math.max(0, Math.min(1, (aspect - 3) / 2.5));
  return {
    yaw: DEFAULT_CAMERA.yaw - 0.25 * t1 - 0.2 * t2,
    pitch: DEFAULT_CAMERA.pitch - 0.22 * t1 - 0.18 * t2,
  };
}

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

function createLife(nx, ny, nz) {
  var size = nx * ny * nz;
  var pos = new Int32Array(size);
  pos.fill(-1);
  function wrapTable(n, delta) {
    var t = new Int32Array(n);
    for (var i = 0; i < n; i++) t[i] = (i + delta + n) % n;
    return t;
  }
  return {
    nx: nx,
    ny: ny,
    nz: nz,
    live: new Int32Array(size),
    next: new Int32Array(size),
    liveCount: 0,
    pos: pos,
    counts: new Uint8Array(size),
    touched: new Int32Array(size),
    wpx: wrapTable(nx, -1),
    wnx: wrapTable(nx, 1),
    wpy: wrapTable(ny, -1),
    wny: wrapTable(ny, 1),
    wpz: wrapTable(nz, -1),
    wnz: wrapTable(nz, 1),
    zo: new Int32Array(3),
    yo: new Int32Array(3),
    xs: new Int32Array(3),
  };
}

function setCell(life, x, y, z, value) {
  var nx = life.nx,
    ny = life.ny,
    nz = life.nz;
  if (x < 0 || x >= nx || y < 0 || y >= ny || z < 0 || z >= nz) return;
  var k = x + nx * (y + ny * z);
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

function resizeLife(old, nx, ny, nz) {
  var life = createLife(nx, ny, nz);
  var offX = Math.floor((old.nx - nx) / 2);
  var offY = Math.floor((old.ny - ny) / 2);
  var offZ = Math.floor((old.nz - nz) / 2);
  var onx = old.nx;
  var onxy = old.nx * old.ny;
  for (var i = 0; i < old.liveCount; i++) {
    var k = old.live[i];
    var z = (k / onxy) | 0;
    var rem = k - z * onxy;
    var y = (rem / onx) | 0;
    var x = rem - y * onx;
    setCell(life, x - offX, y - offY, z - offZ, 1);
  }
  return life;
}

function wrapDelta(a, b, n) {
  var d = Math.abs(a - b);
  return Math.min(d, n - d);
}

function pickShape(r) {
  var roll = Math.random();
  var thin = Math.max(1.5, r * 0.35);
  var s;
  if (roll < 0.25) {
    s = { box: false, d: [r, r, r] }; // ball
  } else if (roll < 0.45) {
    var a = r * 0.8;
    s = { box: true, d: [a, a, a] }; // cube
  } else if (roll < 0.65) {
    s = { box: false, d: [r, thin, r] }; // flat disc
  } else if (roll < 0.85) {
    var d = [thin, thin, thin]; // rod
    d[Math.floor(Math.random() * 3)] = r * 1.5;
    s = { box: false, d: d };
  } else {
    s = {
      box: false,
      d: [
        r * (0.6 + Math.random() * 0.6),
        r * (0.6 + Math.random() * 0.6),
        r * (0.6 + Math.random() * 0.6),
      ],
    }; // lumpy ellipsoid
  }
  var m = Math.max(s.d[0], s.d[1], s.d[2]);
  s.rad = s.box ? m * 1.74 : m;
  return s;
}

function fillShape(life, cx, cy, cz, s, density) {
  var ax = s.d[0],
    ay = s.d[1],
    az = s.d[2];
  for (var dz = -Math.ceil(az); dz <= Math.ceil(az); dz++)
    for (var dy = -Math.ceil(ay); dy <= Math.ceil(ay); dy++)
      for (var dx = -Math.ceil(ax); dx <= Math.ceil(ax); dx++) {
        var inside = s.box
          ? Math.abs(dx) <= ax && Math.abs(dy) <= ay && Math.abs(dz) <= az
          : (dx * dx) / (ax * ax) +
              (dy * dy) / (ay * ay) +
              (dz * dz) / (az * az) <=
            1;
        if (inside && Math.random() < density)
          setCell(life, cx + dx, cy + dy, cz + dz, 1);
      }
}

function seedClusters(life, count, rMin, rMax) {
  var dims = [life.nx, life.ny, life.nz];
  var minDim = Math.min(dims[0], dims[1], dims[2]);
  var gap = Math.max(5, minDim * 0.3);
  var placed = [];
  rMax = Math.min(rMax, minDim * 0.3);
  rMin = Math.max(2, Math.min(rMin, rMax));
  rMax = Math.max(rMax, rMin);

  for (var t = 0; t < count * 60 && placed.length < count; t++) {
    // ~65% of structures are tiny (a few cells across); the rest use the style's size range
    var small = Math.random() < 0.65;
    var r = small
      ? 2.2 + Math.random() * 1.3
      : rMin + Math.random() * (rMax - rMin);
    var shape = pickShape(r);
    var c = [0, 0, 0];
    for (var a = 0; a < 3; a++) {
      var lo = Math.min(Math.ceil(shape.rad) + 1, dims[a] / 2);
      c[a] = Math.round(lo + Math.random() * (dims[a] - 2 * lo));
    }
    var ok = true;
    for (var i = 0; i < placed.length && ok; i++) {
      var p = placed[i];
      var dist2 = 0;
      for (var b = 0; b < 3; b++) {
        var dd = wrapDelta(c[b], p.c[b], dims[b]);
        dist2 += dd * dd;
      }
      var need = shape.rad + p.shape.rad + gap;
      if (dist2 < need * need) ok = false;
    }
    if (ok)
      placed.push({
        c: c,
        shape: shape,
        density: small ? 0.4 + Math.random() * 0.1 : 0.2 + Math.random() * 0.15,
      });
  }

  if (!placed.length) {
    placed.push({
      c: [
        Math.floor(dims[0] / 2),
        Math.floor(dims[1] / 2),
        Math.floor(dims[2] / 2),
      ],
      shape: pickShape(rMin),
      density: 0.3,
    });
  }

  placed.forEach(function (p) {
    fillShape(life, p.c[0], p.c[1], p.c[2], p.shape, p.density);
  });
}

function init3dGrid(canvas, nx, ny, nz, config) {
  var life = createLife(nx, ny, nz);
  if (config.startingGen === 'random') {
    var ref = Math.cbrt(nx * ny * nz);
    var spread = Math.max(nx, ny, nz) / Math.max(1, Math.min(nx, ny, nz));
    var scaled = function (c) {
      return Math.round(c * Math.max(1, spread * 0.7));
    };
    var style = Math.floor(Math.random() * 3);
    if (style === 0) {
      // A few big structures
      seedClusters(
        life,
        scaled(3 + Math.floor(Math.random() * 2)),
        ref * 0.14,
        ref * 0.2,
      );
    } else if (style === 1) {
      // Many small structures
      seedClusters(
        life,
        scaled(8 + Math.floor(Math.random() * 7)),
        ref * 0.06,
        ref * 0.09,
      );
    } else {
      // Mixed sizes
      seedClusters(
        life,
        scaled(5 + Math.floor(Math.random() * 4)),
        ref * 0.07,
        ref * 0.16,
      );
    }
  }
  canvas._life3d = life;

  attach3dInteraction(canvas);
  draw3d(canvas);
}

function step3d(canvas) {
  var life = canvas._life3d;
  if (!life) return;

  var nx = life.nx,
    nxy = life.nx * life.ny;
  var live = life.live,
    next = life.next,
    count = life.liveCount;
  var pos = life.pos,
    counts = life.counts,
    touched = life.touched;
  var wpx = life.wpx,
    wnx = life.wnx,
    wpy = life.wpy,
    wny = life.wny,
    wpz = life.wpz,
    wnz = life.wnz;
  var zo = life.zo,
    yo = life.yo,
    xs = life.xs;
  var nt = 0;
  var i, k;

  for (i = 0; i < count; i++) {
    k = live[i];
    var z = (k / nxy) | 0;
    var rem = k - z * nxy;
    var y = (rem / nx) | 0;
    var x = rem - y * nx;

    zo[0] = wpz[z] * nxy;
    zo[1] = z * nxy;
    zo[2] = wnz[z] * nxy;
    yo[0] = wpy[y] * nx;
    yo[1] = y * nx;
    yo[2] = wny[y] * nx;
    xs[0] = wpx[x];
    xs[1] = x;
    xs[2] = wnx[x];

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

  var nn = 0;
  for (i = 0; i < nt; i++) {
    k = touched[i];
    var cnt = counts[k];
    counts[k] = 0;
    if (pos[k] >= 0 ? SURVIVE[cnt] : BIRTH[cnt]) next[nn++] = k;
  }

  for (i = 0; i < count; i++) pos[live[i]] = -1;
  for (i = 0; i < nn; i++) pos[next[i]] = i;

  life.live = next;
  life.next = live;
  life.liveCount = nn;
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

function boxAspect(rx, ry, rz) {
  var R = 0.5 * Math.sqrt(rx * rx + ry * ry + rz * rz);
  var D0 = R * 3;
  var cy0 = Math.cos(fitCam.yaw),
    sy0 = Math.sin(fitCam.yaw),
    cp0 = Math.cos(fitCam.pitch),
    sp0 = Math.sin(fitCam.pitch);
  var maxX = 1e-6,
    maxY = 1e-6;
  for (var i = 0; i < 8; i++) {
    var px = (i & 1 ? rx : -rx) / 2;
    var py = (i & 2 ? ry : -ry) / 2;
    var pz = (i & 4 ? rz : -rz) / 2;
    var x1 = px * cy0 + pz * sy0;
    var z1 = -px * sy0 + pz * cy0;
    var y2 = py * cp0 - z1 * sp0;
    var z2 = py * sp0 + z1 * cp0;
    var f = 1 / (D0 + z2);
    maxX = Math.max(maxX, Math.abs(x1 * f));
    maxY = Math.max(maxY, Math.abs(y2 * f));
  }
  return maxX / maxY;
}

function getBoxDims(n, width, height) {
  var A = Math.max(0.15, Math.min(MAX_ASPECT, width / height));
  var rx = 1,
    ry = 1,
    rz = 1;
  var lo = 1,
    hi = MAX_ASPECT,
    mid,
    i;
  if (A >= boxAspect(1, 1, 1)) {
    for (i = 0; i < 40; i++) {
      mid = (lo + hi) / 2;
      if (boxAspect(mid, 1, 1) < A) lo = mid;
      else hi = mid;
    }
    rx = (lo + hi) / 2;
  } else {
    for (i = 0; i < 40; i++) {
      mid = (lo + hi) / 2;
      if (boxAspect(1, mid, 1) > A) lo = mid;
      else hi = mid;
    }
    ry = (lo + hi) / 2;
  }

  var u = n / Math.cbrt(rx * ry * rz);
  function dim(r) {
    return Math.max(MIN_SIDE, Math.round(u * r));
  }
  return [dim(rx), dim(ry), dim(rz)];
}

function getView(canvas, life) {
  var nx = life.nx,
    ny = life.ny,
    nz = life.nz;
  var R = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
  var D0 = R * 3;

  var cy0 = Math.cos(fitCam.yaw),
    sy0 = Math.sin(fitCam.yaw),
    cp0 = Math.cos(fitCam.pitch),
    sp0 = Math.sin(fitCam.pitch);
  var maxX = 1e-6,
    maxY = 1e-6;
  for (var i = 0; i < 8; i++) {
    var px = (i & 1 ? nx : -nx) / 2;
    var py = (i & 2 ? ny : -ny) / 2;
    var pz = (i & 4 ? nz : -nz) / 2;
    var x1 = px * cy0 + pz * sy0;
    var z1 = -px * sy0 + pz * cy0;
    var y2 = py * cp0 - z1 * sp0;
    var z2 = py * sp0 + z1 * cp0;
    var f = 1 / (D0 + z2);
    maxX = Math.max(maxX, Math.abs(x1 * f));
    maxY = Math.max(maxY, Math.abs(y2 * f));
  }
  var F = BOX_FIT * Math.min(canvas.width / 2 / maxX, canvas.height / 2 / maxY);

  return {
    nx: nx,
    ny: ny,
    nz: nz,
    R: R,
    D: D0 / cam.zoom,
    F: F,
    cx: canvas.width / 2,
    cy: canvas.height / 2,
    cyw: Math.cos(cam.yaw),
    syw: Math.sin(cam.yaw),
    cpt: Math.cos(cam.pitch),
    spt: Math.sin(cam.pitch),
  };
}

var LIGHT = (function () {
  var x = -0.5,
    y = -0.7,
    z = -0.6;
  var l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

function getBasis(v) {
  var axes = [
    [v.cyw, v.syw * v.spt, -v.syw * v.cpt],
    [0, v.cpt, v.spt],
    [v.syw, -v.cyw * v.spt, v.cyw * v.cpt],
  ];
  var sign = [0, 0, 0],
    dots = [0, 0, 0],
    maxDot = 0.0001;
  for (var a = 0; a < 3; a++) {
    sign[a] = axes[a][2] < 0 ? 1 : -1;
    dots[a] = Math.max(
      0,
      sign[a] *
        (axes[a][0] * LIGHT[0] + axes[a][1] * LIGHT[1] + axes[a][2] * LIGHT[2]),
    );
    if (dots[a] > maxDot) maxDot = dots[a];
  }
  var lum = [0, 0, 0];
  for (var b = 0; b < 3; b++)
    lum[b] = (0.35 + 0.65 * dots[b]) / (0.35 + 0.65 * maxDot);
  return { axes: axes, sign: sign, lum: lum };
}

function buildSprite(s, basis) {
  var A = basis.axes,
    sg = basis.sign;
  var hx =
    (Math.abs(A[0][0]) + Math.abs(A[1][0]) + Math.abs(A[2][0])) * 0.5 * s;
  var hy =
    (Math.abs(A[0][1]) + Math.abs(A[1][1]) + Math.abs(A[2][1])) * 0.5 * s;
  var ox = Math.ceil(hx) + 1,
    oy = Math.ceil(hy) + 1;
  var w = ox * 2,
    h = oy * 2;
  var cls = new Uint8Array(w * h);
  var zo = new Float32Array(w * h);

  for (var a = 0; a < 3; a++) {
    var e = A[a],
      u = A[(a + 1) % 3],
      v = A[(a + 2) % 3];
    var det = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(det) < 1e-3) continue;
    var ccx = sg[a] * 0.5 * e[0],
      ccy = sg[a] * 0.5 * e[1],
      ccz = sg[a] * 0.5 * e[2];
    for (var j = 0; j < h; j++) {
      var ry = (j - oy + 0.5) / s - ccy;
      for (var i = 0; i < w; i++) {
        var rx = (i - ox + 0.5) / s - ccx;
        var al = (rx * v[1] - ry * v[0]) / det;
        var be = (u[0] * ry - u[1] * rx) / det;
        var aa = Math.abs(al),
          ab = Math.abs(be);
        if (aa > 0.5 || ab > 0.5) continue;
        var z = ccz + al * u[2] + be * v[2];
        var k = j * w + i;
        if (cls[k] === 0 || z < zo[k]) {
          var m = (0.5 - Math.max(aa, ab)) * s;
          var q = s >= 5 ? Math.round(Math.max(0, Math.min(1, 1 - m)) * 3) : 0;
          cls[k] = 1 + a + 3 * q;
          zo[k] = q > 0 ? z - 0.03 : z;
        }
      }
    }
  }
  return { w: w, h: h, ox: ox, oy: oy, cls: cls, zo: zo };
}

function getPal(pals, level, levels, basis, deadRgb, liveRgb) {
  var p = pals[level];
  if (p) return p;
  p = new Uint32Array(13);
  var shade = 1 - 0.7 * (level / (levels - 1));
  for (var a = 0; a < 3; a++) {
    var lum = basis.lum[a] * shade;
    var faceRgb = [
      deadRgb[0] + (liveRgb[0] - deadRgb[0]) * lum,
      deadRgb[1] + (liveRgb[1] - deadRgb[1]) * lum,
      deadRgb[2] + (liveRgb[2] - deadRgb[2]) * lum,
    ];
    var edgeRgb = [
      deadRgb[0] + (liveRgb[0] - deadRgb[0]) * lum * 0.45,
      deadRgb[1] + (liveRgb[1] - deadRgb[1]) * lum * 0.45,
      deadRgb[2] + (liveRgb[2] - deadRgb[2]) * lum * 0.45,
    ];
    for (var q = 0; q < 4; q++) {
      p[1 + a + 3 * q] = mixPacked(faceRgb, edgeRgb, q / 3);
    }
  }
  pals[level] = p;
  return p;
}

function draw3d(canvas) {
  var life = canvas._life3d;
  if (!life) return;

  var nx = life.nx,
    nxy = life.nx * life.ny;
  var halfX = life.nx / 2,
    halfY = life.ny / 2,
    halfZ = life.nz / 2;
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

  var v = getView(canvas, life);
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

  var cache = canvas._sprites3d;
  if (!cache || cache.yaw !== cam.yaw || cache.pitch !== cam.pitch) {
    cache = canvas._sprites3d = {
      yaw: cam.yaw,
      pitch: cam.pitch,
      basis: getBasis(v),
      map: {},
    };
  }
  var basis = cache.basis;

  var LEVELS = 32;
  var pals = new Array(LEVELS);

  for (var i = 0; i < life.liveCount; i++) {
    var k = live[i];
    var z = (k / nxy) | 0;
    var rem = k - z * nxy;
    var y = (rem / nx) | 0;
    var x = rem - y * nx;

    var px = x + 0.5 - halfX;
    var py = y + 0.5 - halfY;
    var pz = z + 0.5 - halfZ;

    var x1 = px * cyw + pz * syw;
    var z1 = -px * syw + pz * cyw;
    var y2 = py * cpt - z1 * spt;
    var z2 = py * spt + z1 * cpt;

    var d = D + z2;
    var f = F / d;

    var t = (d - dNear) / span;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var level = (t * (LEVELS - 1)) | 0;

    var xa, xb, ya, yb, row, idx;

    if (f < 2.5) {
      var size = Math.max(1, Math.round(f));
      var x0 = Math.round(cx + x1 * f - f / 2);
      var y0 = Math.round(cy + y2 * f - f / 2);
      xa = x0 < 0 ? 0 : x0;
      xb = x0 + size > width ? width : x0 + size;
      ya = y0 < 0 ? 0 : y0;
      yb = y0 + size > height ? height : y0 + size;
      if (xa >= xb || ya >= yb) continue;
      var flat = mixPacked(deadRgb, liveRgb, (1 - 0.7 * t) * 0.85);
      for (var fy = ya; fy < yb; fy++) {
        row = fy * width;
        for (var fx = xa; fx < xb; fx++) {
          idx = row + fx;
          if (d < zbuf[idx]) {
            zbuf[idx] = d;
            pixels[idx] = flat;
          }
        }
      }
      continue;
    }

    var key = Math.round(f * 4) / 4;
    var sp =
      cache.map[key] || (cache.map[key] = buildSprite(key + 0.75, basis));
    var sx = Math.round(cx + x1 * f) - sp.ox;
    var sy = Math.round(cy + y2 * f) - sp.oy;
    xa = sx < 0 ? 0 : sx;
    xb = sx + sp.w > width ? width : sx + sp.w;
    ya = sy < 0 ? 0 : sy;
    yb = sy + sp.h > height ? height : sy + sp.h;
    if (xa >= xb || ya >= yb) continue;

    var pal = getPal(pals, level, LEVELS, basis, deadRgb, liveRgb);
    var cls = sp.cls,
      zo = sp.zo;
    for (var yy = ya; yy < yb; yy++) {
      row = yy * width;
      var srow = (yy - sy) * sp.w - sx;
      for (var xx = xa; xx < xb; xx++) {
        var c = cls[srow + xx];
        if (c === 0) continue;
        idx = row + xx;
        var dz = d + zo[srow + xx];
        if (dz < zbuf[idx]) {
          zbuf[idx] = dz;
          pixels[idx] = pal[c];
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  drawOverlay3d(canvas, ctx, v, liveRgb);
}

function drawOverlay3d(canvas, ctx, v, liveRgb) {
  var corners = [];
  for (var i = 0; i < 8; i++) {
    var px = (i & 1 ? v.nx : -v.nx) / 2;
    var py = (i & 2 ? v.ny : -v.ny) / 2;
    var pz = (i & 4 ? v.nz : -v.nz) / 2;
    var x1 = px * v.cyw + pz * v.syw;
    var z1 = -px * v.syw + pz * v.cyw;
    var y2 = py * v.cpt - z1 * v.spt;
    var z2 = py * v.spt + z1 * v.cpt;
    var f = v.F / (v.D + z2);
    corners.push([v.cx + x1 * f, v.cy + y2 * f]);
  }
  var rgb = liveRgb.join(',');
  ctx.strokeStyle = 'rgba(' + rgb + ',0.5)';
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
  var v = getView(canvas, life);
  var dims = [life.nx, life.ny, life.nz];
  var nx = life.nx,
    ny = life.ny;

  function toWorld(x, y, z) {
    var y1 = y * v.cpt + z * v.spt;
    var z1 = -y * v.spt + z * v.cpt;
    return [x * v.cyw - z1 * v.syw, y1, x * v.syw + z1 * v.cyw];
  }
  var o = toWorld(0, 0, -v.D);
  var dir = toWorld((sx - v.cx) / v.F, (sy - v.cy) / v.F, 1);
  o = [o[0] + dims[0] / 2, o[1] + dims[1] / 2, o[2] + dims[2] / 2];

  var tEnter = 0,
    tExit = Infinity;
  for (var ax = 0; ax < 3; ax++) {
    if (Math.abs(dir[ax]) < 1e-12) {
      if (o[ax] < 0 || o[ax] > dims[ax]) return null;
    } else {
      var t1 = (0 - o[ax]) / dir[ax];
      var t2 = (dims[ax] - o[ax]) / dir[ax];
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
    cell[a] = Math.min(dims[a] - 1, Math.max(0, Math.floor(p)));
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
  for (var iter = 0; iter < dims[0] + dims[1] + dims[2] + 3; iter++) {
    var k = cell[0] + nx * (cell[1] + ny * cell[2]);
    if (life.pos[k] >= 0 && !(stroke && stroke.has(k))) {
      hit = cell.slice();
      break;
    }
    if (cell[1] === ny - 1 && !floorCell) floorCell = cell.slice();
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
    if (cell[m] < 0 || cell[m] >= dims[m]) break;
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
    camTouched = true;
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
    if (!kill) stroke.add(c[0] + life.nx * (c[1] + life.ny * c[2]));
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
  var aspect = canvas.width / canvas.height;
  var auto = autoCamera(aspect);
  fitCam.yaw = auto.yaw;
  fitCam.pitch = auto.pitch;
  if (!camTouched) {
    cam.yaw = auto.yaw;
    cam.pitch = auto.pitch;
  }
  var box = getBoxDims(n, canvas.width, canvas.height);
  var life = canvas._life3d;
  if (life) {
    if (life.nx !== box[0] || life.ny !== box[1] || life.nz !== box[2])
      canvas._life3d = resizeLife(life, box[0], box[1], box[2]);
    attach3dInteraction(canvas);
    draw3d(canvas);
  } else {
    init3dGrid(canvas, box[0], box[1], box[2], activeConfig);
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
  camTouched = false;
  cam.yaw = fitCam.yaw;
  cam.pitch = fitCam.pitch;
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
