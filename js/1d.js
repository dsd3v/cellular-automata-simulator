export var defaults = {
  liveCellColor: '#ffffff',
  deadCellColor: '#000000',
  cellsPerRow: 100,
  renderSpeedFps: 60,
  runningState: 'stopped',
  rule: Math.floor(Math.random() * 256),
  startingGen: 'center',
};

var MAX_COLS_1D = 1000;

var simStates;
var getCurrentSim;
var getCanvas;
var saveStateToStorage;
var applyStateToUI;
var updateCanvasLayout;
var pauseSimulation;
var setAnimFrame;

var ruleInput = document.getElementById('rule-input');
var startingGen1dContainer = document.getElementById('starting-gen-1d');

export function init(ctx) {
  simStates = ctx.simStates;
  getCurrentSim = ctx.getCurrentSim;
  getCanvas = ctx.getCanvas;
  saveStateToStorage = ctx.saveStateToStorage;
  applyStateToUI = ctx.applyStateToUI;
  updateCanvasLayout = ctx.updateCanvasLayout;
  pauseSimulation = ctx.pauseSimulation;
  setAnimFrame = ctx.setAnimFrame;
}

function makeGen1d(startingGen) {
  var gen = new Uint8Array(MAX_COLS_1D);
  if (startingGen === 'center') {
    gen[Math.floor(MAX_COLS_1D / 2)] = 1;
  } else if (startingGen === 'random') {
    for (var i = 0; i < MAX_COLS_1D; i++) {
      gen[i] = Math.random() < 0.5 ? 1 : 0;
    }
  } else if (startingGen === 'alternating') {
    for (var i = 0; i < MAX_COLS_1D; i++) {
      gen[i] = i % 2;
    }
  }
  return gen;
}

function pushHistoryRow1d(canvas, row, totalRows) {
  canvas._history1d.push(row);
  if (canvas._history1d.length > totalRows) canvas._history1d.shift();
}

function draw1dHistory(canvas) {
  var history = canvas._history1d;
  if (!history) return;

  var cellSize = canvas._cellSize;
  var displayCols = canvas._cols1d;
  var ctx = canvas.getContext('2d');
  var liveColor = simStates['1d'].liveCellColor;
  var deadColor = simStates['1d'].deadCellColor;
  var startCol = Math.floor((MAX_COLS_1D - displayCols) / 2);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (var r = 0; r < history.length; r++) {
    var row = history[r];
    var y = r * cellSize;
    for (var c = 0; c < displayCols; c++) {
      ctx.fillStyle = row[startCol + c] ? liveColor : deadColor;
      ctx.fillRect(c * cellSize, y, cellSize, cellSize);
    }
  }
}

function applyRule1d(cells, ruleByte) {
  var next = new Uint8Array(cells.length);
  for (var i = 0; i < cells.length; i++) {
    var l = cells[(i - 1 + cells.length) % cells.length];
    var c = cells[i];
    var r = cells[(i + 1) % cells.length];
    next[i] = (ruleByte >> ((l << 2) | (c << 1) | r)) & 1;
  }
  return next;
}

export function layout(canvas, activeConfig, dims) {
  var cellSize = dims.cellSize;
  var cols = dims.cols;
  var newWidth = dims.newWidth;

  var newHeight = Math.ceil((window.innerHeight * 1.2) / cellSize) * cellSize;
  var totalRows = Math.floor(newHeight / cellSize);

  canvas.width = newWidth;
  canvas.height = newHeight;

  if (!canvas._history1d || !canvas._history1d.length) {
    var gen = makeGen1d(activeConfig.startingGen);
    canvas._history1d = [gen];
    canvas._lastGen1d = gen;
  } else {
    while (canvas._history1d.length > totalRows) canvas._history1d.shift();
  }
  canvas._cellSize = cellSize;
  canvas._cols1d = cols;
  canvas._ruleByte = activeConfig.rule;
  draw1dHistory(canvas);
}

export function applyToUI(state) {
  if (ruleInput) ruleInput.value = state.rule;

  if (startingGen1dContainer) {
    var r = startingGen1dContainer.querySelector(
      `input[value="${state.startingGen}"]`,
    );
    if (r) r.checked = true;
  }
}

export function reset(canvas) {
  simStates['1d'] = { ...defaults };
  simStates['1d'].rule = Math.floor(Math.random() * 256);
  canvas._lastGen1d = null;
  canvas._history1d = null;
}

export function run() {
  var lastTickTime = performance.now();
  var accumulatedTime = 0;

  function tick1d(currentTime) {
    if (simStates[getCurrentSim()].runningState !== 'running') return;

    var delta = currentTime - lastTickTime;
    lastTickTime = currentTime;

    var targetFps = simStates['1d'].renderSpeedFps;
    var fpsInterval = 1000 / targetFps;
    accumulatedTime += delta;

    if (accumulatedTime >= fpsInterval) {
      var rowsPerFrame = Math.floor(accumulatedTime / fpsInterval);
      accumulatedTime %= fpsInterval;

      if (rowsPerFrame > 5) {
        rowsPerFrame = 5;
        accumulatedTime = 0;
      }

      var canvas = getCanvas();
      var ctx = canvas.getContext('2d');

      for (var i = 0; i < rowsPerFrame; i++) {
        var cellSize = canvas._cellSize;
        var displayCols = canvas._cols1d;
        var ruleByte = canvas._ruleByte;
        var totalRows = Math.floor(canvas.height / cellSize);
        var gen = canvas._lastGen1d;
        var liveColor = simStates['1d'].liveCellColor;
        var deadColor = simStates['1d'].deadCellColor;
        var startCol = Math.floor((MAX_COLS_1D - displayCols) / 2);

        if (canvas._history1d.length >= totalRows) {
          ctx.drawImage(canvas, 0, -cellSize);
        }
        var y = Math.min(canvas._history1d.length, totalRows - 1) * cellSize;

        for (var c = 0; c < displayCols; c++) {
          ctx.fillStyle = gen[startCol + c] ? liveColor : deadColor;
          ctx.fillRect(c * cellSize, y, cellSize, cellSize);
        }
        pushHistoryRow1d(canvas, gen, totalRows);
        canvas._lastGen1d = applyRule1d(gen, ruleByte);
      }
    }
    setAnimFrame(requestAnimationFrame(tick1d));
  }
  setAnimFrame(requestAnimationFrame(tick1d));
}

export function bindControls() {
  if (ruleInput) {
    ruleInput.addEventListener('change', e => {
      var parsed = parseInt(e.target.value, 10);
      if (isNaN(parsed)) {
        var randomRule = Math.floor(Math.random() * 256);
        simStates['1d'].rule = randomRule;
        e.target.value = randomRule;
      } else {
        var clampedRule = Math.max(0, Math.min(255, parsed));
        simStates['1d'].rule = clampedRule;
        e.target.value = clampedRule;
      }

      saveStateToStorage();
      updateCanvasLayout();
    });
  }

  if (startingGen1dContainer) {
    startingGen1dContainer.addEventListener('change', e => {
      simStates['1d'].startingGen = e.target.value;
      pauseSimulation();

      var canvas = getCanvas();
      canvas._lastGen1d = null;
      canvas._history1d = null;

      saveStateToStorage();
      applyStateToUI();
    });
  }
}
