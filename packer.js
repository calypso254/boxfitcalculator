(function (global) {
  "use strict";

  var EPS = 1e-9;

  function isPositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
  }

  function cloneBox(box) {
    return { l: Number(box.l), w: Number(box.w), h: Number(box.h) };
  }

  function boxVolume(box) {
    return box.l * box.w * box.h;
  }

  function formatDims(box) {
    return box.l + " x " + box.w + " x " + box.h;
  }

  function getRotations(dims) {
    var candidates = [
      { l: dims.l, w: dims.w, h: dims.h },
      { l: dims.l, w: dims.h, h: dims.w },
      { l: dims.w, w: dims.l, h: dims.h },
      { l: dims.w, w: dims.h, h: dims.l },
      { l: dims.h, w: dims.l, h: dims.w },
      { l: dims.h, w: dims.w, h: dims.l }
    ];

    var seen = new Set();
    var unique = [];

    for (var i = 0; i < candidates.length; i += 1) {
      var c = candidates[i];
      var key = c.l + "|" + c.w + "|" + c.h;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }

    return unique;
  }

  function validateContainer(container) {
    var box = cloneBox(container);
    if (!isPositiveNumber(box.l) || !isPositiveNumber(box.w) || !isPositiveNumber(box.h)) {
      throw new Error("Container dimensions must be positive numbers.");
    }
    return box;
  }

  function expandItems(items, padding) {
    var expanded = [];

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i] || {};
      var qty = Number(item.qty);
      var rawDims = { l: Number(item.l), w: Number(item.w), h: Number(item.h) };

      if (!isPositiveNumber(rawDims.l) || !isPositiveNumber(rawDims.w) || !isPositiveNumber(rawDims.h)) {
        throw new Error("Item dimensions must be positive numbers.");
      }

      if (!Number.isInteger(qty) || qty < 1) {
        throw new Error("Item quantity must be an integer greater than 0.");
      }

      var inflated = {
        l: rawDims.l + (padding * 2),
        w: rawDims.w + (padding * 2),
        h: rawDims.h + (padding * 2)
      };

      if (!isPositiveNumber(inflated.l) || !isPositiveNumber(inflated.w) || !isPositiveNumber(inflated.h)) {
        throw new Error("Padding makes one or more item dimensions invalid.");
      }

      for (var copy = 1; copy <= qty; copy += 1) {
        expanded.push({
          itemId: item.id || ("item-" + (i + 1)),
          label: item.label || ("Item " + (i + 1)),
          itemIndex: i,
          copyIndex: copy,
          originalDims: rawDims,
          dims: inflated,
          volume: boxVolume(inflated)
        });
      }
    }

    expanded.sort(function (a, b) {
      if (b.volume !== a.volume) {
        return b.volume - a.volume;
      }

      var aMax = Math.max(a.dims.l, a.dims.w, a.dims.h);
      var bMax = Math.max(b.dims.l, b.dims.w, b.dims.h);
      if (bMax !== aMax) {
        return bMax - aMax;
      }

      if (a.itemIndex !== b.itemIndex) {
        return a.itemIndex - b.itemIndex;
      }

      return a.copyIndex - b.copyIndex;
    });

    return expanded;
  }

  function compareSpaces(a, b) {
    if (a.z !== b.z) {
      return a.z - b.z;
    }
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    if (a.x !== b.x) {
      return a.x - b.x;
    }

    var va = boxVolume(a);
    var vb = boxVolume(b);
    if (va !== vb) {
      return va - vb;
    }

    if (a.l !== b.l) {
      return a.l - b.l;
    }
    if (a.w !== b.w) {
      return a.w - b.w;
    }
    return a.h - b.h;
  }

  function fits(space, dims) {
    return (
      dims.l <= space.l + EPS &&
      dims.w <= space.w + EPS &&
      dims.h <= space.h + EPS
    );
  }

  function findBestPlacement(piece, spaces) {
    var ordered = spaces.slice().sort(compareSpaces);
    var rotations = getRotations(piece.dims);
    var best = null;

    for (var si = 0; si < ordered.length; si += 1) {
      var space = ordered[si];
      var spaceVolume = boxVolume(space);

      if (piece.volume > spaceVolume + EPS) {
        continue;
      }

      for (var ri = 0; ri < rotations.length; ri += 1) {
        var rotated = rotations[ri];
        if (!fits(space, rotated)) {
          continue;
        }

        var waste = spaceVolume - piece.volume;
        var slack = (space.l - rotated.l) + (space.w - rotated.w) + (space.h - rotated.h);

        var score = [
          waste,
          slack,
          space.z,
          space.y,
          space.x,
          ri
        ];

        if (!best || isScoreLower(score, best.score)) {
          best = {
            space: space,
            rotation: rotated,
            rotationIndex: ri,
            score: score
          };
        }
      }
    }

    return best;
  }

  function isScoreLower(a, b) {
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] < b[i]) {
        return true;
      }
      if (a[i] > b[i]) {
        return false;
      }
    }
    return false;
  }

  function splitSpace(space, placedDims, nextIdRef) {
    var children = [];

    var remL = space.l - placedDims.l;
    var remW = space.w - placedDims.w;
    var remH = space.h - placedDims.h;

    if (remL > EPS) {
      children.push({
        id: nextIdRef.value++,
        x: space.x + placedDims.l,
        y: space.y,
        z: space.z,
        l: remL,
        w: space.w,
        h: space.h
      });
    }

    if (remW > EPS) {
      children.push({
        id: nextIdRef.value++,
        x: space.x,
        y: space.y + placedDims.w,
        z: space.z,
        l: placedDims.l,
        w: remW,
        h: space.h
      });
    }

    if (remH > EPS) {
      children.push({
        id: nextIdRef.value++,
        x: space.x,
        y: space.y,
        z: space.z + placedDims.h,
        l: placedDims.l,
        w: placedDims.w,
        h: remH
      });
    }

    return children;
  }

  function contains(a, b) {
    return (
      a.x <= b.x + EPS &&
      a.y <= b.y + EPS &&
      a.z <= b.z + EPS &&
      (a.x + a.l) + EPS >= (b.x + b.l) &&
      (a.y + a.w) + EPS >= (b.y + b.w) &&
      (a.z + a.h) + EPS >= (b.z + b.h)
    );
  }

  function pruneSpaces(spaces) {
    var filtered = [];
    var keySet = new Set();

    for (var i = 0; i < spaces.length; i += 1) {
      var s = spaces[i];
      if (s.l <= EPS || s.w <= EPS || s.h <= EPS) {
        continue;
      }

      var key = [s.x, s.y, s.z, s.l, s.w, s.h].map(function (n) {
        return n.toFixed(8);
      }).join("|");

      if (!keySet.has(key)) {
        keySet.add(key);
        filtered.push(s);
      }
    }

    var pruned = [];
    for (var a = 0; a < filtered.length; a += 1) {
      var current = filtered[a];
      var isContained = false;

      for (var b = 0; b < filtered.length; b += 1) {
        if (a === b) {
          continue;
        }

        if (contains(filtered[b], current)) {
          isContained = true;
          break;
        }
      }

      if (!isContained) {
        pruned.push(current);
      }
    }

    return pruned;
  }

  function packContainer(containerInput, itemsInput, options) {
    var container = validateContainer(containerInput);
    var items = Array.isArray(itemsInput) ? itemsInput : [];
    var padding = options && Number.isFinite(options.padding) ? Number(options.padding) : 0;

    if (padding < 0) {
      throw new Error("Padding must be 0 or greater.");
    }

    if (!items.length) {
      throw new Error("At least one item is required.");
    }

    var pieces = expandItems(items, padding);
    var nextIdRef = { value: 1 };
    var spaces = [{
      id: nextIdRef.value++,
      x: 0,
      y: 0,
      z: 0,
      l: container.l,
      w: container.w,
      h: container.h
    }];

    var placements = [];
    var unplaced = [];
    var usedVolume = 0;

    for (var i = 0; i < pieces.length; i += 1) {
      var piece = pieces[i];
      var choice = findBestPlacement(piece, spaces);

      if (!choice) {
        for (var r = i; r < pieces.length; r += 1) {
          unplaced.push(pieces[r]);
        }
        break;
      }

      var spaceIndex = -1;
      for (var s = 0; s < spaces.length; s += 1) {
        if (spaces[s].id === choice.space.id) {
          spaceIndex = s;
          break;
        }
      }

      if (spaceIndex < 0) {
        throw new Error("Internal packing state error.");
      }

      var parent = spaces[spaceIndex];
      spaces.splice(spaceIndex, 1);

      placements.push({
        itemId: piece.itemId,
        label: piece.label,
        copyIndex: piece.copyIndex,
        position: { x: parent.x, y: parent.y, z: parent.z },
        size: cloneBox(choice.rotation),
        originalSize: cloneBox(piece.originalDims),
        inflatedSize: cloneBox(piece.dims),
        orientationText: formatDims(choice.rotation)
      });

      usedVolume += piece.volume;

      var split = splitSpace(parent, choice.rotation, nextIdRef);
      spaces = pruneSpaces(spaces.concat(split));
    }

    var containerVolume = boxVolume(container);
    var unusedVolume = Math.max(containerVolume - usedVolume, 0);

    return {
      success: unplaced.length === 0,
      container: container,
      containerVolume: containerVolume,
      usedVolume: usedVolume,
      unusedVolume: unusedVolume,
      efficiency: containerVolume > 0 ? (usedVolume / containerVolume) * 100 : 0,
      totalItems: pieces.length,
      placedCount: placements.length,
      unplacedCount: unplaced.length,
      placements: placements,
      unplaced: unplaced,
      freeSpaceCount: spaces.length
    };
  }

  function compareCandidates(a, b) {
    if (a.volume !== b.volume) {
      return a.volume - b.volume;
    }

    if (a.candidate.l !== b.candidate.l) {
      return a.candidate.l - b.candidate.l;
    }

    if (a.candidate.w !== b.candidate.w) {
      return a.candidate.w - b.candidate.w;
    }

    if (a.candidate.h !== b.candidate.h) {
      return a.candidate.h - b.candidate.h;
    }

    return a.candidateIndex - b.candidateIndex;
  }

  function findSmallestFittingBox(candidates, items, options) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error("At least one candidate box is required.");
    }

    var ranked = [];

    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = validateContainer(candidates[i]);
      var result = packContainer(candidate, items, options);

      ranked.push({
        candidateIndex: i,
        candidate: candidate,
        label: candidates[i].label || ("Candidate " + (i + 1)),
        volume: boxVolume(candidate),
        fits: result.success,
        result: result
      });
    }

    ranked.sort(compareCandidates);

    var best = null;
    for (var r = 0; r < ranked.length; r += 1) {
      if (ranked[r].fits) {
        best = ranked[r];
        break;
      }
    }

    return {
      ranked: ranked,
      best: best,
      anyFit: Boolean(best)
    };
  }

  function estimateDimensionalWeight(volume, divisor) {
    var d = Number(divisor);
    if (!isPositiveNumber(volume) || !isPositiveNumber(d)) {
      return null;
    }
    return volume / d;
  }

  global.BoxFitPacker = {
    getRotations: getRotations,
    packContainer: packContainer,
    findSmallestFittingBox: findSmallestFittingBox,
    estimateDimensionalWeight: estimateDimensionalWeight
  };
}(typeof window !== "undefined" ? window : globalThis));
