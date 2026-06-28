(function () {
  if (sessionStorage.getItem('redirectPath')) {
    sessionStorage.removeItem('redirectPath');
  }
  if (
    window.location.pathname.toLowerCase() !== '/cellular-automata-simulator'
  ) {
    window.history.replaceState(null, null, '/cellular-automata-simulator');
  }

  var default1d = {
    liveCellColor: '#ffffff',
    deadCellColor: '#000000',
    cellsPerRow: 100,
    renderSpeedFps: 60,
    runningState: 'stopped',
    rule: Math.floor(Math.random() * 256),
    startingGen: 'center',
  };
  var default2d = {
    liveCellColor: '#ffffff',
    deadCellColor: '#000000',
    cellsPerRow: 100,
    renderSpeedFps: 60,
    runningState: 'stopped',
    startingGen: 'random',
    clickTap: 'revive',
  };
  var MAX_COLS_1D = 1000;

  var currentSim = localStorage.getItem('selectedSim') || '1d';
  var savedStates = localStorage.getItem('simStates');
  var simStates = savedStates
    ? JSON.parse(savedStates)
    : { '1d': { ...default1d }, '2d': { ...default2d } };

  var simSelector = document.getElementById('sim-selector');
  var runPauseBtn = document.getElementById('run-pause-btn');
  var resetBtn = document.getElementById('reset-btn');
  var cellsColorPicker = document.getElementById('cells-color-picker');
  var rowSizeInput = document.getElementById('row-size');
  var rowSizeVal = document.getElementById('row-size-val');
  var renderSpeedInput = document.getElementById('render-speed');
  var renderSpeedVal = document.getElementById('render-speed-val');
  var ruleInput = document.getElementById('rule-input');
  var startingGen1dContainer = document.getElementById('starting-gen-1d');
  var startingGen2dContainer = document.getElementById('starting-gen-2d');
  var clickTapContainer = document.getElementById('click-tap');

  function getComplementColor(hex) {
    if (hex.indexOf('#') === 0) hex = hex.slice(1);
    var r = (255 - parseInt(hex.slice(0, 2), 16)).toString(16).padStart(2, '0');
    var g = (255 - parseInt(hex.slice(2, 4), 16)).toString(16).padStart(2, '0');
    var b = (255 - parseInt(hex.slice(4, 6), 16)).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function saveStateToStorage() {
    localStorage.setItem('simStates', JSON.stringify(simStates));
  }
  var _cachedCanvas = null;
  function getCanvas() {
    if (!_cachedCanvas) {
      var container = document.getElementById('canvas-container');
      if (container) _cachedCanvas = container.querySelector('canvas');
    }
    return _cachedCanvas;
  }

  function makeGen1d(startingGen) {
    var gen = new Uint8Array(MAX_COLS_1D);
    if (startingGen === 'center') gen[Math.floor(MAX_COLS_1D / 2)] = 1;
    else if (startingGen === 'random')
      for (var i = 0; i < MAX_COLS_1D; i++)
        gen[i] = Math.random() < 0.5 ? 1 : 0;
    else if (startingGen === 'alternating')
      for (var i = 0; i < MAX_COLS_1D; i++) gen[i] = i % 2;
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

    if (currentSim === '1d') {
      var newHeight =
        Math.ceil((window.innerHeight * 1.2) / cellSize) * cellSize;
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
    } else if (currentSim === '2d') {
      var rows2d = Math.ceil((window.innerHeight * 1.2) / cellSize);

      if (canvas.width !== newWidth || canvas.height !== rows2d * cellSize) {
        canvas.width = newWidth;
        canvas.height = rows2d * cellSize;
      }

      var grid = canvas._grid2d;
      if (grid) {
        var oldRows = grid.length;
        var oldCols = grid[0].length;

        if (oldRows !== rows2d || oldCols !== cols) {
          var newGrid = makeEmpty2dGrid(cols, rows2d);
          var rowOffset = Math.floor((oldRows - rows2d) / 2);
          var colOffset = Math.floor((oldCols - cols) / 2);
          for (var r = 0; r < rows2d; r++) {
            var srcR = r + rowOffset;
            if (srcR < 0 || srcR >= oldRows) continue;
            for (var c = 0; c < cols; c++) {
              var srcC = c + colOffset;
              if (srcC < 0 || srcC >= oldCols) continue;
              newGrid[r][c] = grid[srcR][srcC];
            }
          }
          canvas._grid2d = newGrid;
        }

        canvas._cellSize = cellSize;
        canvas._cols2d = cols;
        canvas._rows2d = rows2d;
        attach2dInteraction(canvas, activeConfig);
        draw2dGrid(canvas);
      } else {
        init2dGrid(canvas, cellSize, cols, rows2d, activeConfig);
      }
    }
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
    if (currentSim === '1d') {
      if (ruleInput) ruleInput.value = state.rule;
      if (startingGen1dContainer) {
        var r = startingGen1dContainer.querySelector(
          `input[value="${state.startingGen}"]`,
        );
        if (r) r.checked = true;
      }
    } else if (currentSim === '2d') {
      if (clickTapContainer) {
        var r = clickTapContainer.querySelector(
          `input[value="${state.clickTap}"]`,
        );
        if (r) r.checked = true;
      }
      if (startingGen2dContainer) {
        var r = startingGen2dContainer.querySelector(
          `input[value="${state.startingGen}"]`,
        );
        if (r) r.checked = true;
      }
    }
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

  function makeEmpty2dGrid(cols, rows) {
    var grid = [];
    for (var r = 0; r < rows; r++) grid.push(new Uint8Array(cols));
    return grid;
  }

  function init2dGrid(canvas, cellSize, cols, rows, config) {
    var grid = makeEmpty2dGrid(cols, rows);
    if (config.startingGen === 'random') {
      var style = Math.floor(Math.random() * 4);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) grid[r][c] = 0;
      }
      if (style === 0) {
        // Random Clusters / Blobs (Clumped noise)
        var numBlobs = Math.floor(Math.random() * 15) + 5; // 5 to 20 blobs
        for (var b = 0; b < numBlobs; b++) {
          var centerR = Math.floor(Math.random() * rows);
          var centerC = Math.floor(Math.random() * cols);
          var radius = Math.floor(Math.random() * 8) + 3; // Blob size
          for (
            var r = Math.max(0, centerR - radius);
            r < Math.min(rows, centerR + radius);
            r++
          ) {
            for (
              var c = Math.max(0, centerC - radius);
              c < Math.min(cols, centerC + radius);
              c++
            ) {
              if (Math.random() < 0.6) grid[r][c] = 1;
            }
          }
        }
      } else if (style === 1) {
        // Randomized Uniform Density (Ranges from sparse 5% to dense 45%)
        var density = Math.random() * 0.4 + 0.05;
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            if (Math.random() < density) grid[r][c] = 1;
          }
        }
      } else if (style === 2) {
        // Geometric Shapes / Concentric Boxes
        var numBoxes = Math.floor(Math.random() * 4) + 2;
        for (var i = 0; i < numBoxes; i++) {
          var w = Math.floor(Math.random() * (cols / 3)) + 5;
          var h = Math.floor(Math.random() * (rows / 3)) + 5;
          var startR = Math.floor(Math.random() * (rows - h));
          var startC = Math.floor(Math.random() * (cols - w));
          for (var r = startR; r < startR + h; r++) {
            for (var c = startC; c < startC + w; c++) {
              if (
                r === startR ||
                r === startR + h - 1 ||
                c === startC ||
                c === startC + w - 1 ||
                Math.random() < 0.2
              ) {
                grid[r][c] = 1;
              }
            }
          }
        }
      } else if (style === 3) {
        // Horizontal or Vertical Strips / Lines
        var isHorizontal = Math.random() < 0.5;
        var numLines = Math.floor(Math.random() * 6) + 3;
        for (var l = 0; l < numLines; l++) {
          if (isHorizontal) {
            var r = Math.floor(Math.random() * rows);
            for (
              var c = Math.floor(Math.random() * cols);
              c < cols;
              c += Math.random() < 0.5 ? 1 : 2
            )
              grid[r][c] = 1;
          } else {
            var c = Math.floor(Math.random() * cols);
            for (
              var r = Math.floor(Math.random() * rows);
              r < rows;
              r += Math.random() < 0.5 ? 1 : 2
            )
              grid[r][c] = 1;
          }
        }
      }
    }
    canvas._grid2d = grid;
    canvas._cellSize = cellSize;
    canvas._cols2d = cols;
    canvas._rows2d = rows;
    attach2dInteraction(canvas, config);
    draw2dGrid(canvas);
  }

  function hexToPackedColor(hex) {
    if (hex.indexOf('#') === 0) hex = hex.slice(1);
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  function step2d(canvas) {
    var grid = canvas._grid2d;
    if (!grid) return;
    var rows = grid.length,
      cols = grid[0].length;
    var next = makeEmpty2dGrid(cols, rows);

    var colLeft = canvas._colLeft;
    var colRight = canvas._colRight;
    if (!colLeft || colLeft.length !== cols) {
      colLeft = new Int32Array(cols);
      colRight = new Int32Array(cols);
      for (var c = 0; c < cols; c++) {
        colLeft[c] = c === 0 ? cols - 1 : c - 1;
        colRight[c] = c === cols - 1 ? 0 : c + 1;
      }
      canvas._colLeft = colLeft;
      canvas._colRight = colRight;
    }

    for (var r = 0; r < rows; r++) {
      var rUp = r === 0 ? rows - 1 : r - 1;
      var rDown = r === rows - 1 ? 0 : r + 1;
      var neighborRows = [grid[rUp], grid[r], grid[rDown]];
      var gridMid = grid[r];
      var nextRow = next[r];

      for (var c = 0; c < cols; c++) {
        var cl = colLeft[c],
          cr = colRight[c];
        var n = 0;
        for (var ri = 0; ri < 3; ri++) {
          var row = neighborRows[ri];
          n += row[cl] + row[c] + row[cr];
        }
        n -= gridMid[c];
        nextRow[c] = n === 3 || (n === 2 && gridMid[c]) ? 1 : 0;
      }
    }
    canvas._grid2d = next;
  }

  function draw2dGrid(canvas) {
    var grid = canvas._grid2d;
    if (!grid) return;
    var cellSize = canvas._cellSize;
    var ctx = canvas.getContext('2d');
    var rows = grid.length,
      cols = grid[0].length;
    var width = canvas.width,
      height = canvas.height;

    var imageData = canvas._imageData;
    if (
      !imageData ||
      imageData.width !== width ||
      imageData.height !== height
    ) {
      imageData = ctx.createImageData(width, height);
      canvas._imageData = imageData;
      canvas._pixels32 = new Uint32Array(imageData.data.buffer);
    }
    var pixels = canvas._pixels32;

    var liveColor = hexToPackedColor(simStates['2d'].liveCellColor);
    var deadColor = hexToPackedColor(simStates['2d'].deadCellColor);

    for (var r = 0; r < rows; r++) {
      var gridRow = grid[r];
      var rowStartY = r * cellSize;
      for (var c = 0; c < cols; c++) {
        var color = gridRow[c] ? liveColor : deadColor;
        var colStartX = c * cellSize;
        for (var dy = 0; dy < cellSize; dy++) {
          var rowOffset = (rowStartY + dy) * width;
          for (var dx = 0; dx < cellSize; dx++) {
            pixels[rowOffset + colStartX + dx] = color;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function attach2dInteraction(canvas, config) {
    canvas._painting = false;
    canvas._interactionAttached = (canvas._interactionAttached || 0) + 1;
    var generation = canvas._interactionAttached;
    var wasRunningBeforePaint = false;
    function cellFromEvent(e) {
      var rect = canvas.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        r: Math.floor((clientY - rect.top) / canvas._cellSize),
        c: Math.floor((clientX - rect.left) / canvas._cellSize),
      };
    }
    function paint(e) {
      if (
        !(
          currentSim === '2d' &&
          canvas._painting &&
          generation === canvas._interactionAttached
        )
      )
        return;
      if (e.cancelable) e.preventDefault();
      var pos = cellFromEvent(e);
      var grid = canvas._grid2d;
      if (!grid) return;
      var rows = grid.length,
        cols = grid[0].length;
      if (pos.r < 0 || pos.r >= rows || pos.c < 0 || pos.c >= cols) return;
      var targetValue = simStates['2d'].clickTap === 'kill' ? 0 : 1;
      grid[pos.r][pos.c] = targetValue;
      if (
        simStates[currentSim].runningState === 'running' ||
        wasRunningBeforePaint
      ) {
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = targetValue
          ? simStates['2d'].liveCellColor
          : simStates['2d'].deadCellColor;
        ctx.fillRect(
          pos.c * canvas._cellSize,
          pos.r * canvas._cellSize,
          canvas._cellSize,
          canvas._cellSize,
        );
      } else {
        draw2dGrid(canvas);
      }
    }
    canvas.addEventListener('mousedown', e => {
      if (!(currentSim === '2d')) return;
      var isCustom = simStates['2d'].startingGen === 'custom';
      wasRunningBeforePaint = simStates[currentSim].runningState === 'running';
      if (!(wasRunningBeforePaint || isCustom)) return;
      if (wasRunningBeforePaint && !isCustom) pauseSimulation();
      canvas._painting = true;
      paint(e);
    });
    canvas.addEventListener('mousemove', paint);
    canvas.addEventListener('mouseup', () => {
      if (!(currentSim === '2d')) return;
      canvas._painting = false;
      if (wasRunningBeforePaint && simStates['2d'].startingGen !== 'custom') {
        simStates[currentSim].runningState = 'running';
        runSimulation();
      }
      wasRunningBeforePaint = false;
    });
    canvas.addEventListener('mouseleave', () => {
      if (!(currentSim === '2d')) return;
      if (
        canvas._painting &&
        wasRunningBeforePaint &&
        simStates['2d'].startingGen !== 'custom'
      ) {
        simStates[currentSim].runningState = 'running';
        runSimulation();
      }
      canvas._painting = false;
      wasRunningBeforePaint = false;
    });
    canvas.addEventListener(
      'touchstart',
      e => {
        if (!(currentSim === '2d')) return;
        var isCustom = simStates['2d'].startingGen === 'custom';
        wasRunningBeforePaint =
          simStates[currentSim].runningState === 'running';
        if (!wasRunningBeforePaint && !isCustom) return;
        if (wasRunningBeforePaint && !isCustom) pauseSimulation();
        canvas._painting = true;
        paint(e);
      },
      { passive: false },
    );
    canvas.addEventListener('touchmove', paint, { passive: false });
    canvas.addEventListener('touchend', () => {
      if (!(currentSim === '2d')) return;
      canvas._painting = false;
      if (wasRunningBeforePaint && simStates['2d'].startingGen !== 'custom') {
        simStates[currentSim].runningState = 'running';
        runSimulation();
      }
      wasRunningBeforePaint = false;
    });
  }

  var _animFrameId = null;

  function run1dSimulation() {
    var canvas = getCanvas();
    var lastTickTime = performance.now();
    var estimatedHz = 60;
    var accumulatedTime = 0;
    function tick1d(currentTime) {
      if (simStates[currentSim].runningState !== 'running') return;
      var delta = currentTime - lastTickTime;
      lastTickTime = currentTime;
      if (delta > 0) {
        var currentHz = 1000 / delta;
        estimatedHz = estimatedHz * 0.9 + currentHz * 0.1;
      }
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
      _animFrameId = requestAnimationFrame(tick1d);
    }
    _animFrameId = requestAnimationFrame(tick1d);
  }

  function run2dSimulation() {
    var lastTickTime2d = performance.now();
    var accumulatedTime2d = 0;
    var estimatedHz2d = 60;
    function tick2d(currentTime) {
      if (simStates[currentSim].runningState !== 'running') return;
      var delta = currentTime - lastTickTime2d;
      lastTickTime2d = currentTime;
      if (delta > 0) {
        var currentHz = 1000 / delta;
        estimatedHz2d = estimatedHz2d * 0.9 + currentHz * 0.1;
      }
      var targetFps = simStates['2d'].renderSpeedFps;
      var fpsInterval = 1000 / targetFps;
      accumulatedTime2d += delta;
      if (accumulatedTime2d >= fpsInterval) {
        var gensPerFrame = Math.floor(accumulatedTime2d / fpsInterval);
        accumulatedTime2d %= fpsInterval;
        if (gensPerFrame > 5) {
          gensPerFrame = 5;
          accumulatedTime2d = 0;
        }
        var canvas = getCanvas();
        for (var i = 0; i < gensPerFrame; i++) step2d(canvas);
        draw2dGrid(canvas);
      }
      _animFrameId = requestAnimationFrame(tick2d);
    }
    _animFrameId = requestAnimationFrame(tick2d);
  }

  function runSimulation() {
    if (currentSim === '1d') run1dSimulation();
    else if (currentSim === '2d') run2dSimulation();
  }

  function pauseSimulation() {
    simStates[currentSim].runningState = 'stopped';
    if (_animFrameId) {
      cancelAnimationFrame(_animFrameId);
      _animFrameId = null;
    }
  }

  function restart() {
    var wasRunning = runPauseBtn.getAttribute('data-state') === 'running';
    if (wasRunning) pauseSimulation();
    updateCanvasLayout();
    if (wasRunning) {
      simStates[currentSim].runningState = 'running';
      runSimulation();
    }
  }

  if (simSelector) {
    var savedRadio = simSelector.querySelector(`input[value="${currentSim}"]`);
    if (savedRadio) savedRadio.checked = true;
    applyStateToUI();
    simSelector.addEventListener('change', e => {
      var newSim = e.target.value;
      if (runPauseBtn && runPauseBtn.getAttribute('data-state') === 'running')
        pauseSimulation();
      simStates[newSim].runningState = 'stopped';
      localStorage.setItem('selectedSim', newSim);
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
      if (currentSim === '1d') {
        simStates['1d'] = { ...default1d };
        simStates['1d'].rule = Math.floor(Math.random() * 256);
        canvas._lastGen1d = null;
        canvas._history1d = null;
      } else if (currentSim === '2d') {
        simStates['2d'] = { ...default2d };
        canvas._grid2d = null;
      }
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
      if (currentSim == '1d') {
        simStates['1d'].liveCellColor = e.target.value;
        simStates['1d'].deadCellColor = getComplementColor(e.target.value);
      } else if (currentSim == '2d') {
        simStates['2d'].liveCellColor = e.target.value;
        simStates['2d'].deadCellColor = getComplementColor(e.target.value);
      }
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

  if (startingGen2dContainer) {
    startingGen2dContainer.addEventListener('change', e => {
      simStates['2d'].startingGen = e.target.value;
      pauseSimulation();
      var canvas = getCanvas();
      canvas._grid2d = null;
      saveStateToStorage();
      applyStateToUI();
    });
  }

  if (clickTapContainer) {
    clickTapContainer.addEventListener('change', e => {
      simStates['2d'].clickTap = e.target.value;
      saveStateToStorage();
    });
  }

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
    saveStateToStorage();
  });
})();
