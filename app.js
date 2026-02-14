(function () {
  "use strict";

  var INCH_TO_CM = 2.54;
  var CM3_PER_IN3 = Math.pow(INCH_TO_CM, 3);
  var COLORS = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#06b6d4",
    "#a855f7", "#14b8a6", "#84cc16", "#f97316", "#e11d48"
  ];

  var FALLBACK_PRESETS = {
    boxes: [
      { id: "mailer-6-4-4", name: "Small Mailer 6 x 4 x 4 in", l: 6, w: 4, h: 4, unit: "in" },
      { id: "mailer-8-6-4", name: "Mailer 8 x 6 x 4 in", l: 8, w: 6, h: 4, unit: "in" },
      { id: "ship-12-10-8", name: "Shipping 12 x 10 x 8 in", l: 12, w: 10, h: 8, unit: "in" },
      { id: "ship-14-10-8", name: "Shipping 14 x 10 x 8 in", l: 14, w: 10, h: 8, unit: "in" },
      { id: "ship-16-12-10", name: "Shipping 16 x 12 x 10 in", l: 16, w: 12, h: 10, unit: "in" },
      { id: "euro-35-25-15", name: "Euro Carton 35 x 25 x 15 cm", l: 35, w: 25, h: 15, unit: "cm" }
    ]
  };

  var state = {
    mode: "fit",
    presets: [],
    result: null,
    colorMap: new Map(),
    lastUnits: "in",
    view3d: {
      yaw: -35,
      pitch: 24,
      dragging: false,
      lastX: 0,
      lastY: 0
    }
  };

  var el = {
    fitTab: document.getElementById("fitModeTab"),
    finderTab: document.getElementById("finderModeTab"),
    fitPanel: document.getElementById("fitPanel"),
    finderPanel: document.getElementById("finderPanel"),
    units: document.querySelectorAll("input[name='units']"),
    padding: document.getElementById("paddingInput"),
    preset: document.getElementById("presetSelect"),
    presetStatus: document.getElementById("presetStatus"),
    applyPreset: document.getElementById("applyPresetBtn"),
    applyCustom: document.getElementById("applyCustomBtn"),
    contL: document.getElementById("fitContainerL"),
    contW: document.getElementById("fitContainerW"),
    contH: document.getElementById("fitContainerH"),
    itemRows: document.getElementById("itemRows"),
    candRows: document.getElementById("candidateRows"),
    addItem: document.getElementById("addItemBtn"),
    addCand: document.getElementById("addCandidateBtn"),
    calc: document.getElementById("calculateBtn"),
    reset: document.getElementById("resetBtn"),
    errs: document.getElementById("formErrors"),
    summary: document.getElementById("resultSummary"),
    rankSec: document.getElementById("rankingSection"),
    rankRows: document.getElementById("rankingRows"),
    placeSec: document.getElementById("placementSection"),
    placeRows: document.getElementById("placementRows"),
    visSec: document.getElementById("visualSection"),
    show2DToggle: document.getElementById("show2DToggle"),
    viz2dCol: document.getElementById("viz2dCol"),
    layer: document.getElementById("layerSelect"),
    canvas2d: document.getElementById("layoutCanvas"),
    canvas3d: document.getElementById("layout3dCanvas"),
    yawRange: document.getElementById("yawRange"),
    pitchRange: document.getElementById("pitchRange"),
    legend: document.getElementById("legendList"),
    year: document.getElementById("year")
  };

  if (!window.BoxFitPacker) {
    throw new Error("packer.js must load before app.js");
  }

  bindEvents();
  resetForm();
  loadPresets();
  el.year.textContent = String(new Date().getFullYear());

  function bindEvents() {
    el.fitTab.addEventListener("click", function () { setMode("fit"); });
    el.finderTab.addEventListener("click", function () { setMode("finder"); });
    el.addItem.addEventListener("click", function () { addItemRow(); });
    el.addCand.addEventListener("click", function () { addCandidateRow(); });
    el.calc.addEventListener("click", calculate);
    el.reset.addEventListener("click", resetForm);
    el.applyPreset.addEventListener("click", applyPreset);
    el.applyCustom.addEventListener("click", applyCustomBox);
    el.layer.addEventListener("change", redrawVisuals);
    el.show2DToggle.addEventListener("change", function () {
      apply2DToggleVisibility();
      redrawVisuals();
    });

    Array.prototype.forEach.call(el.units, function (radio) {
      radio.addEventListener("change", onUnitsChange);
    });

    el.itemRows.addEventListener("click", function (ev) {
      if (ev.target.classList.contains("remove-item")) {
        removeRow(ev.target.closest("tr"), el.itemRows, "item");
      }
    });

    el.candRows.addEventListener("click", function (ev) {
      if (ev.target.classList.contains("remove-candidate")) {
        removeRow(ev.target.closest("tr"), el.candRows, "candidate");
      }
    });

    el.yawRange.addEventListener("input", function () {
      state.view3d.yaw = Number(el.yawRange.value);
      draw3dCurrent();
    });

    el.pitchRange.addEventListener("input", function () {
      state.view3d.pitch = Number(el.pitchRange.value);
      draw3dCurrent();
    });

    bind3dDrag();
    window.addEventListener("resize", redrawVisuals);
  }

  function bind3dDrag() {
    if (!el.canvas3d) {
      return;
    }

    el.canvas3d.addEventListener("pointerdown", function (ev) {
      state.view3d.dragging = true;
      state.view3d.lastX = ev.clientX;
      state.view3d.lastY = ev.clientY;
      el.canvas3d.setPointerCapture(ev.pointerId);
    });

    el.canvas3d.addEventListener("pointermove", function (ev) {
      if (!state.view3d.dragging) {
        return;
      }

      var dx = ev.clientX - state.view3d.lastX;
      var dy = ev.clientY - state.view3d.lastY;
      state.view3d.lastX = ev.clientX;
      state.view3d.lastY = ev.clientY;

      state.view3d.yaw += dx * 0.5;
      state.view3d.pitch -= dy * 0.35;
      state.view3d.pitch = Math.max(5, Math.min(85, state.view3d.pitch));

      el.yawRange.value = String(Math.round(state.view3d.yaw));
      el.pitchRange.value = String(Math.round(state.view3d.pitch));

      draw3dCurrent();
    });

    function stopDrag(ev) {
      state.view3d.dragging = false;
      try {
        el.canvas3d.releasePointerCapture(ev.pointerId);
      } catch (_err) {
      }
    }

    el.canvas3d.addEventListener("pointerup", stopDrag);
    el.canvas3d.addEventListener("pointercancel", stopDrag);
    el.canvas3d.addEventListener("pointerleave", function () {
      state.view3d.dragging = false;
    });
  }

  function getUnit() {
    var checked = document.querySelector("input[name='units']:checked");
    return checked ? checked.value : "in";
  }

  function setUnit(unit) {
    Array.prototype.forEach.call(el.units, function (radio) {
      radio.checked = radio.value === unit;
    });
  }

  function toCm(value, unit) {
    return unit === "in" ? value * INCH_TO_CM : value;
  }

  function fromCm(value, unit) {
    return unit === "in" ? value / INCH_TO_CM : value;
  }

  function convert(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) {
      return value;
    }
    return fromUnit === "in" ? value * INCH_TO_CM : value / INCH_TO_CM;
  }

  function volDisplay(cm3, unit) {
    return unit === "in" ? cm3 / CM3_PER_IN3 : cm3;
  }

  function fmt(value, decimals) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: Number.isInteger(decimals) ? decimals : 2,
      minimumFractionDigits: 0
    });
  }

  function dimsText(boxCm, unit, decimals) {
    return fmt(fromCm(boxCm.l, unit), decimals) + " x "
      + fmt(fromCm(boxCm.w, unit), decimals) + " x "
      + fmt(fromCm(boxCm.h, unit), decimals);
  }

  function posText(posCm, unit) {
    return "(" + fmt(fromCm(posCm.x, unit), 2) + ", "
      + fmt(fromCm(posCm.y, unit), 2) + ", "
      + fmt(fromCm(posCm.z, unit), 2) + ")";
  }

  function setStatus(message) {
    el.presetStatus.textContent = message || "";
  }

  function updateUnitSuffixes() {
    var unit = getUnit();
    Array.prototype.forEach.call(document.querySelectorAll(".unit-suffix"), function (node) {
      node.textContent = unit;
    });
  }

  function escapeAttr(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).replace(/"/g, "&quot;");
  }

  function setMode(mode) {
    state.mode = mode;
    var fit = mode === "fit";
    el.fitTab.classList.toggle("active", fit);
    el.finderTab.classList.toggle("active", !fit);
    el.fitTab.setAttribute("aria-selected", String(fit));
    el.finderTab.setAttribute("aria-selected", String(!fit));
    el.fitPanel.classList.toggle("hidden", !fit);
    el.finderPanel.classList.toggle("hidden", fit);
  }

  function resetForm() {
    clearErrors();
    setUnit("in");
    state.lastUnits = "in";
    setMode("fit");

    el.padding.value = "0.125";
    el.contL.value = "12";
    el.contW.value = "10";
    el.contH.value = "8";

    el.itemRows.innerHTML = "";
    addItemRow({ l: 6, w: 4, h: 2, qty: 2 });
    addItemRow({ l: 3, w: 3, h: 3, qty: 1 });

    el.candRows.innerHTML = "";
    addCandidateRow({ l: 10, w: 8, h: 6 });
    addCandidateRow({ l: 12, w: 10, h: 8 });
    addCandidateRow({ l: 14, w: 10, h: 8 });

    state.view3d.yaw = -35;
    state.view3d.pitch = 24;
    el.yawRange.value = "-35";
    el.pitchRange.value = "24";
    el.show2DToggle.checked = false;
    apply2DToggleVisibility();

    updateUnitSuffixes();
    clearResults();
    setStatus("");
  }

  function onUnitsChange() {
    var oldUnit = state.lastUnits;
    var newUnit = getUnit();

    if (oldUnit === newUnit) {
      return;
    }

    convertInputValue(el.padding, oldUnit, newUnit, 3);
    convertInputValue(el.contL, oldUnit, newUnit, 3);
    convertInputValue(el.contW, oldUnit, newUnit, 3);
    convertInputValue(el.contH, oldUnit, newUnit, 3);

    Array.prototype.forEach.call(el.itemRows.querySelectorAll("tr"), function (row) {
      convertInputValue(row.querySelector(".item-l"), oldUnit, newUnit, 3);
      convertInputValue(row.querySelector(".item-w"), oldUnit, newUnit, 3);
      convertInputValue(row.querySelector(".item-h"), oldUnit, newUnit, 3);
    });

    Array.prototype.forEach.call(el.candRows.querySelectorAll("tr"), function (row) {
      convertInputValue(row.querySelector(".cand-l"), oldUnit, newUnit, 3);
      convertInputValue(row.querySelector(".cand-w"), oldUnit, newUnit, 3);
      convertInputValue(row.querySelector(".cand-h"), oldUnit, newUnit, 3);
    });

    state.lastUnits = newUnit;
    updateUnitSuffixes();
    setStatus("");
  }

  function convertInputValue(input, fromUnit, toUnit, decimals) {
    if (!input) {
      return;
    }

    var raw = input.value.trim();
    if (raw === "") {
      return;
    }

    var value = Number(raw);
    if (!Number.isFinite(value)) {
      return;
    }

    input.value = fmt(convert(value, fromUnit, toUnit), decimals);
  }

  function addItemRow(values) {
    var v = values || {};
    var tr = document.createElement("tr");
    tr.innerHTML = ""
      + "<td data-label='Length'><div class='measure-input'><input class='item-l measure-number' type='number' min='0.01' step='0.01' aria-label='Item length' value='" + escapeAttr(v.l) + "'><span class='unit-suffix'>in</span></div></td>"
      + "<td data-label='Width'><div class='measure-input'><input class='item-w measure-number' type='number' min='0.01' step='0.01' aria-label='Item width' value='" + escapeAttr(v.w) + "'><span class='unit-suffix'>in</span></div></td>"
      + "<td data-label='Height'><div class='measure-input'><input class='item-h measure-number' type='number' min='0.01' step='0.01' aria-label='Item height' value='" + escapeAttr(v.h) + "'><span class='unit-suffix'>in</span></div></td>"
      + "<td data-label='Quantity'><input class='item-qty' type='number' min='1' step='1' aria-label='Item quantity' value='" + escapeAttr(v.qty || 1) + "'></td>"
      + "<td data-label='Action'><button type='button' class='btn remove-btn remove-item'>Remove</button></td>";
    el.itemRows.appendChild(tr);
    updateUnitSuffixes();
  }

  function addCandidateRow(values) {
    var v = values || {};
    var tr = document.createElement("tr");
    tr.innerHTML = ""
      + "<td data-label='Length'><div class='measure-input'><input class='cand-l measure-number' type='number' min='0.01' step='0.01' aria-label='Candidate length' value='" + escapeAttr(v.l) + "'><span class='unit-suffix'>in</span></div></td>"
      + "<td data-label='Width'><div class='measure-input'><input class='cand-w measure-number' type='number' min='0.01' step='0.01' aria-label='Candidate width' value='" + escapeAttr(v.w) + "'><span class='unit-suffix'>in</span></div></td>"
      + "<td data-label='Height'><div class='measure-input'><input class='cand-h measure-number' type='number' min='0.01' step='0.01' aria-label='Candidate height' value='" + escapeAttr(v.h) + "'><span class='unit-suffix'>in</span></div></td>"
      + "<td data-label='Action'><button type='button' class='btn remove-btn remove-candidate'>Remove</button></td>";
    el.candRows.appendChild(tr);
    updateUnitSuffixes();
  }

  function removeRow(row, tbody, label) {
    if (!row || !tbody) {
      return;
    }

    if (tbody.children.length <= 1) {
      setStatus("At least one " + label + " row is required.");
      return;
    }

    row.remove();
  }

  function clearErrors() {
    el.errs.innerHTML = "";
    Array.prototype.forEach.call(document.querySelectorAll(".invalid"), function (node) {
      node.classList.remove("invalid");
      node.removeAttribute("aria-invalid");
    });
  }

  function markInvalid(input) {
    if (input) {
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
    }
  }

  function showErrors(errors) {
    if (!errors.length) {
      el.errs.innerHTML = "";
      return;
    }

    var ul = document.createElement("ul");
    errors.forEach(function (message) {
      var li = document.createElement("li");
      li.textContent = message;
      ul.appendChild(li);
    });

    el.errs.innerHTML = "";
    el.errs.appendChild(ul);
  }

  function readPositive(input, label, errors, allowZero) {
    var raw = input.value.trim();
    var value = Number(raw);

    if (raw === "" || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
      errors.push(label + " must be " + (allowZero ? "0 or greater." : "greater than 0."));
      markInvalid(input);
      return null;
    }

    return value;
  }

  function readInteger(input, label, errors) {
    var raw = input.value.trim();
    var value = Number(raw);

    if (raw === "" || !Number.isInteger(value) || value < 1) {
      errors.push(label + " must be a whole number greater than 0.");
      markInvalid(input);
      return null;
    }

    return value;
  }

  function parseItems(unit, errors) {
    var items = [];

    Array.prototype.forEach.call(el.itemRows.querySelectorAll("tr"), function (row, index) {
      var l = row.querySelector(".item-l");
      var w = row.querySelector(".item-w");
      var h = row.querySelector(".item-h");
      var q = row.querySelector(".item-qty");

      var values = [l.value.trim(), w.value.trim(), h.value.trim(), q.value.trim()];
      if (values.every(function (x) { return x === ""; })) {
        return;
      }

      var lv = readPositive(l, "Item row " + (index + 1) + " length", errors, false);
      var wv = readPositive(w, "Item row " + (index + 1) + " width", errors, false);
      var hv = readPositive(h, "Item row " + (index + 1) + " height", errors, false);
      var qv = readInteger(q, "Item row " + (index + 1) + " quantity", errors);

      if (lv === null || wv === null || hv === null || qv === null) {
        return;
      }

      items.push({
        id: "item-" + (index + 1),
        label: "Item " + (index + 1),
        l: toCm(lv, unit),
        w: toCm(wv, unit),
        h: toCm(hv, unit),
        qty: qv
      });
    });

    if (!items.length) {
      errors.push("Add at least one valid item row.");
    }

    return items;
  }

  function parseCandidates(unit, errors) {
    var candidates = [];

    Array.prototype.forEach.call(el.candRows.querySelectorAll("tr"), function (row, index) {
      var l = row.querySelector(".cand-l");
      var w = row.querySelector(".cand-w");
      var h = row.querySelector(".cand-h");

      var values = [l.value.trim(), w.value.trim(), h.value.trim()];
      if (values.every(function (x) { return x === ""; })) {
        return;
      }

      var lv = readPositive(l, "Candidate row " + (index + 1) + " length", errors, false);
      var wv = readPositive(w, "Candidate row " + (index + 1) + " width", errors, false);
      var hv = readPositive(h, "Candidate row " + (index + 1) + " height", errors, false);

      if (lv === null || wv === null || hv === null) {
        return;
      }

      candidates.push({
        label: "Candidate " + (index + 1),
        l: toCm(lv, unit),
        w: toCm(wv, unit),
        h: toCm(hv, unit)
      });
    });

    if (!candidates.length) {
      errors.push("Add at least one valid candidate box.");
    }

    return candidates;
  }

  function parseContainer(unit, errors) {
    var l = readPositive(el.contL, "Container length", errors, false);
    var w = readPositive(el.contW, "Container width", errors, false);
    var h = readPositive(el.contH, "Container height", errors, false);

    if (l === null || w === null || h === null) {
      return null;
    }

    return { l: toCm(l, unit), w: toCm(w, unit), h: toCm(h, unit) };
  }

  function parseSettings(errors) {
    var unit = getUnit();
    var thickness = readPositive(el.padding, "Exterior box thickness", errors, true);

    if (thickness === null) {
      return null;
    }

    return {
      unit: unit,
      thickness: thickness,
      thicknessCm: toCm(thickness, unit)
    };
  }

  function calculate() {
    clearErrors();

    var errors = [];
    var settings = parseSettings(errors);
    if (!settings) {
      showErrors(errors);
      return;
    }

    var items = parseItems(settings.unit, errors);
    var container = null;
    var candidates = null;

    if (state.mode === "fit") {
      container = parseContainer(settings.unit, errors);
    } else {
      candidates = parseCandidates(settings.unit, errors);
    }

    if (errors.length) {
      showErrors(errors);
      clearResultData();
      return;
    }

    try {
      if (state.mode === "fit") {
        var fit = window.BoxFitPacker.packContainer(container, items, { padding: settings.thicknessCm });
        state.result = { mode: "fit", unit: settings.unit, pack: fit, ranking: null };
        renderFit(fit, settings.unit);
      } else {
        var finder = window.BoxFitPacker.findSmallestFittingBox(candidates, items, { padding: settings.thicknessCm });
        state.result = {
          mode: "finder",
          unit: settings.unit,
          pack: finder.best ? finder.best.result : null,
          ranking: finder
        };
        renderFinder(finder, settings.unit);
      }
    } catch (err) {
      showErrors([err.message || "Calculation failed."]);
      clearResultData();
    }
  }

  function clearResults() {
    state.result = null;
    clearResultData();
    el.summary.className = "result-summary muted";
    el.summary.textContent = "Run a calculation to see results.";
  }

  function clearResultData() {
    el.rankSec.classList.add("hidden");
    el.rankRows.innerHTML = "";
    el.placeSec.classList.add("hidden");
    el.placeRows.innerHTML = "";
    el.visSec.classList.add("hidden");
    el.layer.innerHTML = "";
    el.legend.innerHTML = "";
    apply2DToggleVisibility();

    var ctx2d = el.canvas2d.getContext("2d");
    ctx2d.clearRect(0, 0, el.canvas2d.width, el.canvas2d.height);

    var ctx3d = el.canvas3d.getContext("2d");
    ctx3d.clearRect(0, 0, el.canvas3d.width, el.canvas3d.height);
  }

  function makeMetric(label, value) {
    var node = document.createElement("div");
    node.className = "metric";
    node.innerHTML = "<span class='label'>" + label + "</span><span class='value'>" + value + "</span>";
    return node;
  }

  function renderSummary(text, klass, pack, unit) {
    el.summary.className = "result-summary " + klass;
    el.summary.innerHTML = "";

    var p = document.createElement("p");
    p.textContent = text;
    el.summary.appendChild(p);

    var metrics = document.createElement("div");
    metrics.className = "result-metrics";
    var volUnit = unit === "in" ? "in^3" : "cm^3";

    metrics.appendChild(makeMetric("Placed", pack.placedCount + " / " + pack.totalItems));
    metrics.appendChild(makeMetric("Efficiency", fmt(pack.efficiency, 2) + "%"));
    metrics.appendChild(makeMetric("Unused Volume", fmt(volDisplay(pack.unusedVolume, unit), 2) + " " + volUnit));

    el.summary.appendChild(metrics);
  }

  function renderFit(pack, unit) {
    clearResultData();

    renderSummary(
      pack.success ? "Fit check passed: all items were placed." : "Fit check failed: one or more items could not be placed.",
      pack.success ? "pass" : "fail",
      pack,
      unit
    );

    if (!pack.success && pack.unplaced.length) {
      var note = document.createElement("p");
      note.className = "muted";
      note.textContent = "First unplaced item: " + pack.unplaced[0].label + " copy " + pack.unplaced[0].copyIndex + " (inflated " + dimsText(pack.unplaced[0].dims, unit, 2) + ")";
      el.summary.appendChild(note);
    }

    renderPlacements(pack, unit);
    renderVisuals(pack, unit);
  }

  function renderFinder(finder, unit) {
    clearResultData();

    if (finder.anyFit) {
      var best = finder.best;
      renderSummary(
        "Smallest fitting box: " + best.label + " (" + dimsText(best.candidate, unit, 2) + ").",
        "pass",
        best.result,
        unit
      );
      renderPlacements(best.result, unit);
      renderVisuals(best.result, unit);
    } else {
      renderSummary("No candidate boxes fit all items.", "warn", finder.ranked[0].result, unit);
    }

    el.rankSec.classList.remove("hidden");
    el.rankRows.innerHTML = "";

    finder.ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      tr.innerHTML = ""
        + "<td data-label='Rank'>" + (index + 1) + "</td>"
        + "<td data-label='Candidate'>" + row.label + " (" + dimsText(row.candidate, unit, 2) + ")</td>"
        + "<td data-label='Volume'>" + fmt(volDisplay(row.volume, unit), 2) + " " + (unit === "in" ? "in^3" : "cm^3") + "</td>"
        + "<td data-label='Fits'>" + (row.fits ? "Yes" : "No") + "</td>"
        + "<td data-label='Efficiency'>" + (row.fits ? (fmt(row.result.efficiency, 2) + "%") : "-") + "</td>";
      el.rankRows.appendChild(tr);
    });
  }

  function renderPlacements(pack, unit) {
    if (!pack.placements.length) {
      el.placeSec.classList.add("hidden");
      return;
    }

    el.placeSec.classList.remove("hidden");
    el.placeRows.innerHTML = "";

    pack.placements.forEach(function (p) {
      var tr = document.createElement("tr");
      tr.innerHTML = ""
        + "<td data-label='Item'>" + p.label + "</td>"
        + "<td data-label='Copy'>" + p.copyIndex + "</td>"
        + "<td data-label='Position'>" + posText(p.position, unit) + "</td>"
        + "<td data-label='Orientation'>" + dimsText(p.size, unit, 2) + "</td>";
      el.placeRows.appendChild(tr);
    });
  }

  function colorFor(itemId) {
    if (!state.colorMap.has(itemId)) {
      state.colorMap.set(itemId, COLORS[state.colorMap.size % COLORS.length]);
    }
    return state.colorMap.get(itemId);
  }

  function renderVisuals(pack, unit) {
    if (!pack.placements.length) {
      el.visSec.classList.add("hidden");
      return;
    }

    el.visSec.classList.remove("hidden");
    state.colorMap = new Map();

    var layers = Array.from(
      new Set([0].concat(pack.placements.map(function (p) { return p.position.z; })))
    ).sort(function (a, b) { return a - b; });

    el.layer.innerHTML = "";
    layers.forEach(function (z) {
      var option = document.createElement("option");
      option.value = String(z);
      option.textContent = "z = " + fmt(fromCm(z, unit), 2) + " " + unit;
      el.layer.appendChild(option);
    });

    renderLegend(pack.placements, unit);
    if (el.show2DToggle.checked) {
      drawLayer2d(pack.container, pack.placements, layers[0], unit);
    }
    draw3d(pack.container, pack.placements, unit);
  }

  function redrawVisuals() {
    if (!state.result || !state.result.pack) {
      return;
    }

    var pack = state.result.pack;
    var unit = state.result.unit;
    var layerZ = Number(el.layer.value);

    if (el.show2DToggle.checked) {
      drawLayer2d(pack.container, pack.placements, layerZ, unit);
    }
    draw3d(pack.container, pack.placements, unit);
  }

  function apply2DToggleVisibility() {
    var show2D = Boolean(el.show2DToggle && el.show2DToggle.checked);
    el.viz2dCol.classList.toggle("hidden", !show2D);
    el.layer.disabled = !show2D;
  }

  function drawLayer2d(container, placements, layerZ, unit) {
    resizeCanvasToDisplay(el.canvas2d, 16 / 9);

    var ctx = el.canvas2d.getContext("2d");
    ctx.clearRect(0, 0, el.canvas2d.width, el.canvas2d.height);

    var pad = Math.max(20, Math.min(48, Math.round(el.canvas2d.width * 0.06)));
    var drawW = el.canvas2d.width - (pad * 2);
    var drawH = el.canvas2d.height - (pad * 2);
    if (drawW <= 0 || drawH <= 0) {
      return;
    }
    var scale = Math.min(drawW / container.l, drawH / container.w);
    var boxW = container.l * scale;
    var boxH = container.w * scale;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.fillRect(pad, pad, boxW, boxH);
    ctx.strokeRect(pad, pad, boxW, boxH);

    ctx.fillStyle = "#334155";
    ctx.font = "14px Segoe UI";
    ctx.fillText("Layer z = " + fmt(fromCm(layerZ, unit), 2) + " " + unit, pad, 28);

    placements.forEach(function (p) {
      var z0 = p.position.z;
      var z1 = p.position.z + p.size.h;
      if (layerZ + 1e-9 < z0 || layerZ >= z1 - 1e-9) {
        return;
      }

      var x = pad + p.position.x * scale;
      var y = pad + p.position.y * scale;
      var w = p.size.l * scale;
      var h = p.size.w * scale;

      ctx.globalAlpha = 0.74;
      ctx.fillStyle = colorFor(p.itemId);
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      if (w >= 48 && h >= 18) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "12px Segoe UI";
        ctx.fillText(p.label + " #" + p.copyIndex, x + 4, y + 14);
      }
    });
  }

  function renderLegend(placements, unit) {
    el.legend.innerHTML = "";
    var seen = new Set();

    placements.forEach(function (p) {
      if (seen.has(p.itemId)) {
        return;
      }
      seen.add(p.itemId);

      var li = document.createElement("li");
      li.innerHTML = ""
        + "<span class='swatch' style='background:" + colorFor(p.itemId) + "'></span>"
        + "<span>" + p.label + " (base " + dimsText(p.originalSize, unit, 2) + ")</span>";
      el.legend.appendChild(li);
    });
  }

  function cuboidVertices(pos, size) {
    var x0 = pos.x;
    var y0 = pos.y;
    var z0 = pos.z;
    var x1 = pos.x + size.l;
    var y1 = pos.y + size.w;
    var z1 = pos.z + size.h;

    return [
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 }
    ];
  }

  var FACE_INDEXES = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7]
  ];

  var EDGE_INDEXES = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  function draw3dCurrent() {
    if (!state.result || !state.result.pack) {
      return;
    }
    draw3d(state.result.pack.container, state.result.pack.placements, state.result.unit);
  }

  function draw3d(container, placements, unit) {
    resizeCanvasToDisplay(el.canvas3d, 16 / 9);

    var ctx = el.canvas3d.getContext("2d");
    ctx.clearRect(0, 0, el.canvas3d.width, el.canvas3d.height);

    var yaw = state.view3d.yaw * Math.PI / 180;
    var pitch = state.view3d.pitch * Math.PI / 180;

    var maxDim = Math.max(container.l, container.w, container.h) || 1;
    var center = {
      x: container.l / 2,
      y: container.w / 2,
      z: container.h / 2
    };

    var cx = el.canvas3d.width / 2;
    var cy = el.canvas3d.height / 2;
    var scale = Math.min(el.canvas3d.width, el.canvas3d.height) * 0.98;
    var cameraDistance = 3.1;

    var faces = [];

    placements.forEach(function (p) {
      var verts = cuboidVertices(p.position, p.size);
      var projected = transformAndProject(verts, center, maxDim, yaw, pitch, cx, cy, scale, cameraDistance);
      FACE_INDEXES.forEach(function (face) {
        var poly = face.map(function (idx) { return projected[idx]; });
        faces.push({
          points: poly,
          depth: averageDepth(poly),
          color: colorFor(p.itemId)
        });
      });
    });

    faces.sort(function (a, b) {
      return b.depth - a.depth;
    });

    faces.forEach(function (face) {
      drawPolygon(ctx, face.points, hexToRgba(face.color, 0.56), "#172331", 0.7);
    });

    var containerVerts = cuboidVertices({ x: 0, y: 0, z: 0 }, container);
    var contProj = transformAndProject(containerVerts, center, maxDim, yaw, pitch, cx, cy, scale, cameraDistance);

    EDGE_INDEXES.forEach(function (edge) {
      var a = contProj[edge[0]];
      var b = contProj[edge[1]];
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    });

    ctx.fillStyle = "#334155";
    ctx.font = "13px Segoe UI";
    ctx.fillText("3D view: drag to rotate. Rotate " + Math.round(state.view3d.yaw) + "°, tilt " + Math.round(state.view3d.pitch) + "°", 14, 22);
    ctx.fillText("Units: " + unit, 14, 40);
  }

  function resizeCanvasToDisplay(canvas, ratio) {
    if (!canvas) {
      return;
    }

    var targetWidth = Math.floor(canvas.clientWidth);
    if (!targetWidth || targetWidth < 1) {
      return;
    }

    var targetHeight = Math.max(180, Math.floor(targetWidth / ratio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  function transformAndProject(vertices, center, maxDim, yaw, pitch, cx, cy, scale, cameraDistance) {
    return vertices.map(function (v) {
      var nx = (v.x - center.x) / maxDim;
      var ny = (v.y - center.y) / maxDim;
      var nz = (v.z - center.z) / maxDim;

      var x1 = nx * Math.cos(yaw) - ny * Math.sin(yaw);
      var y1 = nx * Math.sin(yaw) + ny * Math.cos(yaw);
      var z1 = nz;

      var x2 = x1;
      var y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch);
      var z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);

      var depth = cameraDistance - y2;
      var safeDepth = depth < 0.2 ? 0.2 : depth;

      return {
        sx: cx + (x2 * scale) / safeDepth,
        sy: cy - (z2 * scale) / safeDepth,
        depth: safeDepth
      };
    });
  }

  function averageDepth(points) {
    var sum = 0;
    points.forEach(function (p) { sum += p.depth; });
    return sum / points.length;
  }

  function drawPolygon(ctx, points, fill, stroke, width) {
    ctx.beginPath();
    ctx.moveTo(points[0].sx, points[0].sy);
    for (var i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].sx, points[i].sy);
    }
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.fill();

    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function hexToRgba(hex, alpha) {
    var clean = hex.replace("#", "");
    var r = parseInt(clean.slice(0, 2), 16);
    var g = parseInt(clean.slice(2, 4), 16);
    var b = parseInt(clean.slice(4, 6), 16);
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function loadPresets() {
    fetch("boxes.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Failed preset load");
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.boxes)) {
          throw new Error("Invalid preset data");
        }
        state.presets = data.boxes;
        fillPresetSelect();
        setStatus("");
      })
      .catch(function () {
        state.presets = FALLBACK_PRESETS.boxes.slice();
        fillPresetSelect();
        setStatus("Using built-in presets.");
      });
  }

  function fillPresetSelect() {
    el.preset.innerHTML = "";

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select preset box";
    el.preset.appendChild(placeholder);

    state.presets.forEach(function (preset) {
      var option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      el.preset.appendChild(option);
    });
  }

  function applyPreset() {
    var id = el.preset.value;
    if (!id) {
      setStatus("Select a preset first.");
      return;
    }

    var preset = state.presets.find(function (x) { return x.id === id; });
    if (!preset) {
      setStatus("Preset not found.");
      return;
    }

    var toUnit = getUnit();
    var fromUnit = preset.unit || toUnit;

    var l = convert(Number(preset.l), fromUnit, toUnit);
    var w = convert(Number(preset.w), fromUnit, toUnit);
    var h = convert(Number(preset.h), fromUnit, toUnit);

    el.contL.value = fmt(l, 3);
    el.contW.value = fmt(w, 3);
    el.contH.value = fmt(h, 3);
    setStatus("Applied preset to container box.");
  }

  function applyCustomBox() {
    clearErrors();
    var errors = [];

    readPositive(el.contL, "Container length", errors, false);
    readPositive(el.contW, "Container width", errors, false);
    readPositive(el.contH, "Container height", errors, false);
    readPositive(el.padding, "Exterior box thickness", errors, true);

    if (errors.length) {
      showErrors(errors);
      return;
    }

    el.preset.value = "";
    setStatus("Applied custom box values.");
  }
})();
