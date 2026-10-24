import * as sim1d from './1d.js';
import * as sim2d from './2d.js';
import * as sim3d from './3d.js';

var sims = { '1d': sim1d, '2d': sim2d, '3d': sim3d };

var currentSim = sessionStorage.getItem('selectedSim') || '1d';
var savedStates = sessionStorage.getItem('simStates');
var simStates = savedStates
  ? JSON.parse(savedStates)
  : {
      '1d': { ...sim1d.defaults },
      '2d': { ...sim2d.defaults },
      '3d': { ...sim3d.defaults },
    };

var _animFrameId = null;

var simSelector = document.getElementById('sim-selector');
var runPauseBtn = document.getElementById('run-pause-btn');
var resetBtn = document.getElementById('reset-btn');
var cellsColorPicker = document.getElementById('cells-color-picker');
var rowSizeInput = document.getElementById('row-size');
var rowSizeVal = document.getElementById('row-size-val');
var renderSpeedInput = document.getElementById('render-speed');
var renderSpeedVal = document.getElementById('render-speed-val');

function getComplementColor(hex) {
  if (hex.indexOf('#') === 0) hex = hex.slice(1);
  var r = (255 - parseInt(hex.slice(0, 2), 16)).toString(16).padStart(2, '0');
  var g = (255 - parseInt(hex.slice(2, 4), 16)).toString(16).padStart(2, '0');
  var b = (255 - parseInt(hex.slice(4, 6), 16)).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function saveStateToStorage() {
  sessionStorage.setItem('simStates', JSON.stringify(simStates));
}

var _cachedCanvas = null;
function getCanvas() {
  if (!_cachedCanvas) {
    var container = document.getElementById('canvas-container');
    if (container) _cachedCanvas = container.querySelector('canvas');
  }
  return _cachedCanvas;
}

function updateCanvasLayout() {
  var activeConfig = simStates[currentSim];
  var container = document.getElementById('canvas-container');
  var canvas = getCanvas();
  if (!container || !canvas) return;

  var containerWidth = container.clientWidth;
  var cellSize = Math.max(
    1,
    Math.floor(containerWidth / activeConfig.cellsPerRow),
  );
  var cols = Math.floor(containerWidth / cellSize);
  var newWidth = cols * cellSize;

  sims[currentSim].layout(canvas, activeConfig, {
    cellSize: cellSize,
    cols: cols,
    newWidth: newWidth,
  });
}

function applyStateToUI() {
  var state = simStates[currentSim];
  document.body.setAttribute('data-sim', currentSim);

  if (resetBtn) {
    var modeLabel = currentSim.toUpperCase();
    resetBtn.innerHTML = `🔄 Reset ${modeLabel} Simulation`;
    resetBtn.setAttribute(
      'aria-label',
      `Reset ${modeLabel} simulator to new starting state`,
    );
  }

  if (rowSizeInput && rowSizeVal) {
    rowSizeInput.value = state.cellsPerRow;
    rowSizeVal.textContent = `Current: ${state.cellsPerRow}`;
  }

  if (renderSpeedInput && renderSpeedVal) {
    renderSpeedInput.value = state.renderSpeedFps;
    renderSpeedVal.textContent = `Current: ${state.renderSpeedFps} FPS`;
  }

  sims[currentSim].applyToUI(state);

  if (cellsColorPicker) {
    cellsColorPicker.value = state.liveCellColor;
    cellsColorPicker.style.borderColor = state.deadCellColor;
  }

  if (runPauseBtn) {
    runPauseBtn.setAttribute('data-state', state.runningState);
    var iconSpan = runPauseBtn.children[0],
      textSpan = runPauseBtn.children[1];
    if (state.runningState === 'running') {
      iconSpan.textContent = '⏸️';
      textSpan.textContent = 'Pause';
    } else {
      iconSpan.textContent = '▶️';
      textSpan.textContent = 'Run';
    }
  }

  if (state.runningState === 'stopped') updateCanvasLayout();
}

function runSimulation() {
  sims[currentSim].run();
}

function pauseSimulation() {
  simStates[currentSim].runningState = 'stopped';

  if (_animFrameId) {
    cancelAnimationFrame(_animFrameId);
    _animFrameId = null;
  }
}

var ctx = {
  simStates: simStates,
  getCurrentSim: () => currentSim,
  getCanvas: getCanvas,
  saveStateToStorage: saveStateToStorage,
  applyStateToUI: applyStateToUI,
  updateCanvasLayout: updateCanvasLayout,
  runSimulation: runSimulation,
  pauseSimulation: pauseSimulation,
  setAnimFrame: id => {
    _animFrameId = id;
  },
};

sim1d.init(ctx);
sim2d.init(ctx);
sim3d.init(ctx);

if (simSelector) {
  var savedRadio = simSelector.querySelector(`input[value="${currentSim}"]`);
  if (savedRadio) savedRadio.checked = true;
  applyStateToUI();

  simSelector.addEventListener('change', e => {
    var newSim = e.target.value;
    if (runPauseBtn && runPauseBtn.getAttribute('data-state') === 'running') {
      pauseSimulation();
    }

    simStates[newSim].runningState = 'stopped';
    sessionStorage.setItem('selectedSim', newSim);
    saveStateToStorage();
    currentSim = newSim;
    applyStateToUI();
  });
}

if (runPauseBtn) {
  runPauseBtn.addEventListener('click', () => {
    var state = runPauseBtn.getAttribute('data-state');
    if (state === 'stopped') {
      simStates[currentSim].runningState = 'running';
      runPauseBtn.setAttribute('data-state', 'running');
      runPauseBtn.children[0].textContent = '⏸️';
      runPauseBtn.children[1].textContent = 'Pause';
      runSimulation();
    } else if (state === 'running') {
      simStates[currentSim].runningState = 'stopped';
      pauseSimulation();
      runPauseBtn.setAttribute('data-state', 'stopped');
      runPauseBtn.children[0].textContent = '▶️';
      runPauseBtn.children[1].textContent = 'Run';
    }
  });
}

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    var canvas = getCanvas();
    var wasRunning = runPauseBtn.getAttribute('data-state') === 'running';
    if (wasRunning) pauseSimulation();

    sims[currentSim].reset(canvas);

    runPauseBtn.setAttribute('data-state', 'stopped');
    runPauseBtn.children[0].textContent = '▶️';
    runPauseBtn.children[1].textContent = 'Run';
    saveStateToStorage();
    applyStateToUI();
    updateCanvasLayout();
  });
}

if (cellsColorPicker) {
  cellsColorPicker.addEventListener('input', e => {
    simStates[currentSim].liveCellColor = e.target.value;
    simStates[currentSim].deadCellColor = getComplementColor(e.target.value);

    saveStateToStorage();
    applyStateToUI();
    updateCanvasLayout();
  });
}

if (rowSizeInput) {
  rowSizeInput.addEventListener('input', e => {
    if (rowSizeVal) rowSizeVal.textContent = `Current: ${e.target.value}`;
    simStates[currentSim].cellsPerRow = parseInt(e.target.value, 10);

    saveStateToStorage();
    updateCanvasLayout();
  });
}

if (renderSpeedInput) {
  renderSpeedInput.addEventListener('input', e => {
    if (renderSpeedVal)
      renderSpeedVal.textContent = `Current: ${e.target.value} FPS`;
    simStates[currentSim].renderSpeedFps = parseInt(e.target.value, 10);

    saveStateToStorage();
    updateCanvasLayout();
  });
}

sim1d.bindControls();
sim2d.bindControls();
sim3d.bindControls();

var _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    updateCanvasLayout();
  }, 150);
});

window.addEventListener('beforeunload', () => {
  simStates['1d'].runningState = 'stopped';
  simStates['2d'].runningState = 'stopped';
  simStates['3d'].runningState = 'stopped';
  saveStateToStorage();
});
