/* 節奏挑戰計分。
 * 有打到拍點才算分。沒打是 0 分。多打的會進分母，所以每格都打不會高分。
 * 麥克風在網頁自己播放的時段不收聲，避免把節拍器或示範聽成玩家的打擊。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RhythmScore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PATTERNS = {
    q: { label: "四分音符", hits: [0] },
    qr: { label: "四分休止符", hits: [] },
    ee: { label: "兩個八分音符", hits: [0, 0.5] },
    er: { label: "八分休止符加八分音符", hits: [0.5] },
    ssss: { label: "四個十六分音符", hits: [0, 0.25, 0.5, 0.75] },
    ess: { label: "八分音符加兩個十六分音符", hits: [0, 0.5, 0.75] },
    sse: { label: "兩個十六分音符加八分音符", hits: [0, 0.25, 0.5] },
    eds: { label: "附點八分音符加十六分音符", hits: [0, 0.75] }
  };

  var LEVEL_POOLS = [
    ["q", "q", "ee", "qr"],
    ["q", "ee", "er", "qr"],
    ["ee", "er", "eds", "ess", "q"],
    ["ssss", "ess", "sse", "eds", "ee"],
    ["ssss", "ess", "sse", "eds", "er", "ee"]
  ];

  var HIT_COOLDOWN_MS = 50;
  var DEFAULT_THRESHOLD = 0.2;
  var TEACHER_COUNT = 6;

  function createRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function expectedBeats(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var pattern = PATTERNS[ids[i]];
      if (!pattern) continue;
      for (var h = 0; h < pattern.hits.length; h++) out.push(i + pattern.hits[h]);
    }
    return out;
  }

  function buildLevel(levelIndex, rng) {
    var pool = LEVEL_POOLS[levelIndex] || LEVEL_POOLS[0];
    var ids = [];
    for (var i = 0; i < 8; i++) ids.push(pool[Math.floor(rng() * pool.length)]);
    if (expectedBeats(ids).length < 4) {
      ids[0] = "q";
      ids[1] = "ee";
      ids[2] = "q";
      ids[3] = "ee";
    }
    return {
      ids: ids,
      photoIndex: Math.floor(rng() * 8),
      teacherIndex: Math.floor(rng() * TEACHER_COUNT)
    };
  }

  function starsFor(score) {
    if (score >= 90) return 3;
    if (score >= 80) return 2;
    if (score >= 70) return 1;
    return 0;
  }

  function unlocksNext(score) {
    return score >= 80;
  }

  function windowBeatsFor(bpm, feel) {
    var beatMs = 60000 / bpm;
    var ratio = feel === "strict" ? 0.12 : feel === "wide" ? 0.26 : 0.18;
    var ms = Math.min(150, Math.max(60, beatMs * ratio));
    return ms / beatMs;
  }

  function scorePerformance(expectedBeatsList, actualBeats, windowBeats) {
    if (windowBeats == null) windowBeats = 0.18;
    var expected = expectedBeatsList
      .map(Number)
      .filter(function (n) { return Number.isFinite(n); })
      .sort(function (a, b) { return a - b; });
    var actual = (actualBeats || [])
      .map(Number)
      .filter(function (n) { return Number.isFinite(n); })
      .sort(function (a, b) { return a - b; });
    var used = actual.map(function () { return false; });
    var matched = expected.map(function () { return false; });
    for (var ei = 0; ei < expected.length; ei++) {
      var best = -1;
      var bestDist = windowBeats + 1e-9;
      for (var i = 0; i < actual.length; i++) {
        if (used[i]) continue;
        var dist = Math.abs(actual[i] - expected[ei]);
        if (dist <= windowBeats + 1e-9 && dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      }
      if (best >= 0) {
        used[best] = true;
        matched[ei] = true;
      }
    }
    var hits = matched.filter(Boolean).length;
    var extras = actual.length - hits;
    var denom = expected.length + extras;
    var score = denom === 0 ? 0 : Math.round((100 * hits) / denom);
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    return {
      score: score,
      hits: hits,
      misses: expected.length - hits,
      extras: extras,
      stars: starsFor(score),
      unlocksNext: unlocksNext(score),
      matched: matched,
      used: used,
      expected: expected,
      actual: actual
    };
  }

  function gradeRound(ids, actualBeats, windowBeats) {
    var result = scorePerformance(expectedBeats(ids), actualBeats, windowBeats);
    var beats = [];
    for (var i = 0; i < ids.length; i++) beats.push({ expected: 0, matched: 0, extras: 0 });
    var cursor = 0;
    for (var beat = 0; beat < ids.length; beat++) {
      var pattern = PATTERNS[ids[beat]];
      var count = pattern ? pattern.hits.length : 0;
      for (var h = 0; h < count; h++) {
        beats[beat].expected += 1;
        if (result.matched[cursor]) beats[beat].matched += 1;
        cursor += 1;
      }
    }
    for (var a = 0; a < result.actual.length; a++) {
      if (result.used[a]) continue;
      var index = Math.floor(result.actual[a] + 1e-9);
      if (index < 0) index = 0;
      if (index > beats.length - 1) index = beats.length - 1;
      beats[index].extras += 1;
    }
    result.marks = beats.map(function (beat) {
      if (beat.expected === 0 && beat.extras === 0) return "rest";
      if (beat.matched === beat.expected && beat.extras === 0) return "ok";
      return "bad";
    });
    return result;
  }

  function createMicGate(options) {
    var threshold = options && options.threshold != null ? options.threshold : DEFAULT_THRESHOLD;
    var cooldownMs = options && options.cooldownMs != null ? options.cooldownMs : HIT_COOLDOWN_MS;
    var last = -Infinity;
    var maskedUntil = -Infinity;
    return {
      maskUntil: function (timeMs) {
        if (timeMs > maskedUntil) maskedUntil = timeMs;
      },
      sample: function (timeMs, level) {
        if (!(level >= threshold)) return false;
        if (timeMs < maskedUntil) return false;
        if (timeMs - last < cooldownMs) return false;
        last = timeMs;
        return true;
      }
    };
  }

  function collectActualBeats(options) {
    var mode = options.mode;
    var events = options.events || [];
    var beatMs = 60000 / options.bpm;
    var respondStartMs = options.respondStartMs;
    var respondEndMs = options.respondEndMs;
    var maskUntilMs = options.maskUntilMs != null ? options.maskUntilMs : respondStartMs;
    var threshold = options.threshold != null ? options.threshold : DEFAULT_THRESHOLD;
    var cooldownMs = options.cooldownMs != null ? options.cooldownMs : HIT_COOLDOWN_MS;
    var actual = [];
    if (mode === "mic") {
      var gate = createMicGate({ threshold: threshold, cooldownMs: cooldownMs });
      gate.maskUntil(maskUntilMs);
      for (var i = 0; i < events.length; i++) {
        var sample = events[i];
        if (sample.timeMs < respondStartMs || sample.timeMs >= respondEndMs) continue;
        if (gate.sample(sample.timeMs, sample.level || 0)) {
          actual.push((sample.timeMs - respondStartMs) / beatMs);
        }
      }
      return actual;
    }
    var last = -Infinity;
    for (var n = 0; n < events.length; n++) {
      var event = events[n];
      if (event.phase !== "respond") continue;
      if (event.timeMs < respondStartMs || event.timeMs >= respondEndMs) continue;
      if (mode === "key") {
        if (event.key !== " " || event.repeat) continue;
      } else if (mode === "tap") {
        if (event.onControl) continue;
      } else {
        continue;
      }
      if (event.timeMs - last < cooldownMs) continue;
      last = event.timeMs;
      actual.push((event.timeMs - respondStartMs) / beatMs);
    }
    return actual;
  }

  return {
    PATTERNS: PATTERNS,
    LEVEL_POOLS: LEVEL_POOLS,
    HIT_COOLDOWN_MS: HIT_COOLDOWN_MS,
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
    TEACHER_COUNT: TEACHER_COUNT,
    createRng: createRng,
    expectedBeats: expectedBeats,
    buildLevel: buildLevel,
    starsFor: starsFor,
    unlocksNext: unlocksNext,
    windowBeatsFor: windowBeatsFor,
    scorePerformance: scorePerformance,
    gradeRound: gradeRound,
    createMicGate: createMicGate,
    collectActualBeats: collectActualBeats
  };
});
