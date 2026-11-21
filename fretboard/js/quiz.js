/* 吉他／Bass 音階工具：分級小測驗（圈音命名、聽和弦找音） */
(function (root) {
  "use strict";
  var T = (typeof module !== "undefined" && module.exports)
    ? require("./theory.js")
    : root.__fretTheory;

  function rngPick(arr, rng) {
    if (!arr || !arr.length) return null;
    var r = rng || Math.random;
    return arr[Math.floor(r() * arr.length)];
  }
  function shuffle(arr, rng) {
    var a = arr.slice(), r = rng || Math.random, i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(r() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 難度由多軸一起往上：調性、圈幾個音、音階種類、指型數量。調式不入題。
  // 指型從最常用的 La 起，愈後面愈多。hint：full=整型淡圈、soft=更淡的淡圈、none=只留題目圈。
  var QUIZ_LEVELS = [
    { id: 1, name: "第 1 級　起步", blurb: "最常見的調，只練 La 指型，圈 3 個音。指型裡的音會先淡淡圈起來，方便邊玩邊記。",
      tonics: { major: ["C", "G"], minor: ["A", "E"] },
      scales: ["major", "natMinor"], circleCount: 3, types: ["identify"], boards: ["guitar"],
      patterns: [3], hint: "full", streakToUp: 3 },
    { id: 2, name: "第 2 級　多一點調", blurb: "再加上 D、F 大調與 D、B 小調，加入 Do 指型，還是圈 3 個音。指型淡圈會比較淡。",
      tonics: { major: ["C", "G", "D", "F"], minor: ["A", "E", "D", "B"] },
      scales: ["major", "natMinor"], circleCount: 3, types: ["identify"], boards: ["guitar"],
      patterns: [3, 4], hint: "soft", streakToUp: 3 },
    { id: 3, name: "第 3 級　四個音", blurb: "再加入 Sol 指型，圈 4 個音，開始有聽和弦、在指型裡找出指定音的題目。這級起不再提示整型。",
      tonics: { major: ["C", "G", "D", "F"], minor: ["A", "E", "D", "B"] },
      scales: ["major", "natMinor"], circleCount: 4, types: ["identify", "find"], boards: ["guitar"],
      patterns: [2, 3, 4], hint: "none", streakToUp: 3 },
    { id: 4, name: "第 4 級　五聲音階", blurb: "加入 Mi 指型，還有大調五聲、小調五聲，圈 4 個音，也會出到 Bass。",
      tonics: { major: ["C", "G", "D", "F", "A"], minor: ["A", "E", "D", "B"] },
      scales: ["major", "natMinor", "majPent", "minPent"], circleCount: 4, types: ["identify", "find"], boards: ["guitar", "bass"],
      patterns: [1, 2, 3, 4], hint: "none", streakToUp: 4 },
    { id: 5, name: "第 5 級　和聲與藍調", blurb: "五個指型都會出，加入和聲小調、旋律小調、藍調，圈 4 個音。",
      tonics: { major: ["C", "G", "D", "F", "A", "Bb"], minor: ["A", "E", "D", "B", "C", "F#"] },
      scales: ["major", "natMinor", "majPent", "minPent", "harMinor", "melMinor", "blues"], circleCount: 4, types: ["identify", "find"], boards: ["guitar", "bass"],
      patterns: [1, 2, 3, 4, 5], hint: "none", streakToUp: 4 },
    { id: 6, name: "第 6 級　再多一點", blurb: "五個指型、更多調、圈 5 個音，聽和弦找音會比較多。",
      tonics: { major: ["C", "G", "D", "A", "E", "F", "Bb", "Eb"], minor: ["A", "E", "B", "D", "G", "C", "F#", "F"] },
      scales: ["major", "natMinor", "majPent", "minPent", "harMinor", "melMinor", "blues"], circleCount: 5, types: ["identify", "find"], boards: ["guitar", "bass"],
      patterns: [1, 2, 3, 4, 5], hint: "none", streakToUp: 4 }
  ];

  var MODE_SCALE_IDS = ["dorian", "phrygian", "lydian", "mixolydian", "locrian"];

  // 聽和弦找音時，請學生點出的首調數字片段（要在該指型裡都找得到）
  var FIND_FRAGMENTS = {
    major: [["5", "6", "7", "1"], ["1", "2", "3"], ["2", "3", "4", "5"], ["6", "7", "1"], ["1", "2", "3", "5"]],
    natMinor: [["5", "6", "7", "1"], ["6", "7", "1"], ["6", "1", "2", "3"], ["3", "4", "5", "6"], ["1", "2", "3"]],
    majPent: [["1", "2", "3", "5"], ["3", "5", "6", "1"], ["5", "6", "1", "2"], ["1", "2", "3"]],
    minPent: [["6", "1", "2", "3"], ["1", "2", "3", "5"], ["6", "1", "2"], ["5", "6", "1"]],
    harMinor: [["5", "6", "7", "1"], ["4", "#5", "6"], ["6", "7", "1", "2"], ["1", "2", "3", "4"]],
    melMinor: [["5", "6", "7", "1"], ["3", "#4", "#5", "6"], ["6", "7", "1", "2"], ["1", "2", "3"]],
    blues: [["6", "1", "2", "3"], ["1", "2", "b3", "3"], ["6", "1", "5"], ["2", "b3", "3", "5"]]
  };

  function levelById(id) {
    for (var i = 0; i < QUIZ_LEVELS.length; i++) if (QUIZ_LEVELS[i].id === id) return QUIZ_LEVELS[i];
    return QUIZ_LEVELS[0];
  }

  function patternsForQuestion(level, opts) {
    opts = opts || {};
    if (opts.pattern) return [opts.pattern];
    var lock = opts.shapeLock;
    if (lock && lock !== "all" && lock !== "0" && lock !== 0) return [+lock];
    return (level.patterns && level.patterns.length) ? level.patterns.slice() : [1, 2, 3, 4, 5];
  }
  function hintForQuestion(level, opts) {
    if (opts && opts.hint) return opts.hint;
    return level.hint || "none";
  }

  function compatibleScale(tonic, scaleId, level) {
    var sc = T.scaleById(scaleId);
    if (!sc) return false;
    if (sc.quality === "major" || (sc.id === "majPent")) return level.tonics.major.indexOf(tonic) >= 0;
    return level.tonics.minor.indexOf(tonic) >= 0;
  }

  function pickTonicAndScale(level, rng, forced) {
    if (forced && forced.tonic && forced.scale) return { tonic: forced.tonic, scale: forced.scale };
    var scales = (forced && forced.scale) ? [forced.scale] : level.scales.slice();
    var scale = rngPick(scales, rng);
    var sc = T.scaleById(scale);
    var pool = (sc.quality === "major" || scale === "majPent") ? level.tonics.major : level.tonics.minor;
    var tonic = (forced && forced.tonic) || rngPick(pool, rng);
    if (!compatibleScale(tonic, scale, level)) {
      // 若隨機抽到不合的組合，改抽一個合的
      var pairs = [];
      level.scales.forEach(function (sid) {
        var s = T.scaleById(sid);
        var p = (s.quality === "major" || sid === "majPent") ? level.tonics.major : level.tonics.minor;
        p.forEach(function (tn) { pairs.push({ tonic: tn, scale: sid }); });
      });
      return rngPick(pairs, rng);
    }
    return { tonic: tonic, scale: scale };
  }

  function notesInBox(board, tonic, scale, pattern, anchor) {
    return T.patternNotes(board, tonic, scale, pattern, anchor);
  }

  function uniqueByKey(notes) {
    var seen = {}, out = [];
    notes.forEach(function (n) {
      var k = n.string + "-" + n.fret;
      if (!seen[k]) { seen[k] = 1; out.push(n); }
    });
    return out;
  }

  // 圈音時盡量選不同級數，並包含主音（若主音在把位裡）
  function pickCircled(notes, count, rng) {
    var uniq = uniqueByKey(notes);
    if (uniq.length < count) return null;
    var byDeg = {};
    uniq.forEach(function (n) {
      if (!byDeg[n.degree]) byDeg[n.degree] = [];
      byDeg[n.degree].push(n);
    });
    var degs = shuffle(Object.keys(byDeg), rng);
    if (byDeg["6"] && T.isMinorSystem(notes[0] && /* filled later */ "x")) { /* noop, handled below */ }
    var picked = [], usedDeg = {};
    // 優先主音
    var tonicNotes = uniq.filter(function (n) { return n.tonic; });
    if (tonicNotes.length && picked.length < count) {
      var tn = rngPick(tonicNotes, rng);
      picked.push(tn);
      usedDeg[tn.degree] = 1;
    }
    degs.forEach(function (d) {
      if (picked.length >= count) return;
      if (usedDeg[d]) return;
      picked.push(rngPick(byDeg[d], rng));
      usedDeg[d] = 1;
    });
    // 還不夠就補不同格子
    shuffle(uniq, rng).forEach(function (n) {
      if (picked.length >= count) return;
      if (!picked.some(function (p) { return p.string === n.string && p.fret === n.fret; })) picked.push(n);
    });
    if (picked.length < count) return null;
    picked = picked.slice(0, count).sort(function (a, b) {
      return a.string - b.string || a.fret - b.fret;
    });
    return picked;
  }

  function keyAndScaleTitle(tonic, scaleId) {
    var sc = T.scaleById(scaleId);
    if (sc.id === "major") return tonic + " 大調";
    if (sc.id === "natMinor") return tonic + " 小調（自然小調）";
    if (sc.quality === "minor") return tonic + " 小調　" + sc.name;
    if (sc.quality === "major") return tonic + " 大調　" + sc.name;
    return tonic + "　" + sc.name;
  }

  function identifyPrompt(q) {
    var n = q.targets.length;
    return {
      kicker: "請看圈起來的音",
      title: keyAndScaleTitle(q.tonic, q.scale),
      shape: T.patternLabel(q.pattern),
      ask: "圈起來的 " + n + " 個音，分別是哪個音？用數字音名作答（小調主音是 6，大調主音是 1）。",
      text: keyAndScaleTitle(q.tonic, q.scale) + "　" + T.patternLabel(q.pattern) + "　圈起來的 " + n + " 個音是哪些？"
    };
  }

  function findPrompt(q) {
    var seq = q.targetDegrees.join("  ");
    return {
      kicker: "先聽和弦，再找音",
      title: keyAndScaleTitle(q.tonic, q.scale),
      shape: T.patternLabel(q.pattern),
      ask: "請在這個指型裡，把 " + seq + " 點出來。",
      text: "聽這串和弦。請在" + keyAndScaleTitle(q.tonic, q.scale) + "的" + T.patternLabel(q.pattern) + "裡，把 " + seq + " 點出來。"
    };
  }

  function progressionFor(tonic, scaleId) {
    var minor = T.isMinorSystem(scaleId);
    // 以主音為 0 的級數（大調 I=0；小調 i=0）
    var seq = minor
      ? rngPick([[0, 5, 10, 0], [0, 8, 3, 10, 0], [0, 5, 8, 0]]) // i-iv-VII-i / i-VI-III-VII-i / i-iv-VI-i
      : rngPick([[0, 5, 7, 0], [0, 7, 9, 5, 0], [0, 5, 0, 7, 0]]); // I-IV-V-I / I-V-vi-IV-I / I-IV-I-V-I
    // 固定用第一個較明確的（測試可預期）；隨機在 make 時再選
    return { tonic: tonic, minor: minor, degrees: seq, quality: minor ? "minor" : "major" };
  }

  function fixedProgressionFor(tonic, scaleId, kind) {
    var minor = T.isMinorSystem(scaleId);
    var map = {
      cadential: minor ? [0, 5, 10, 0] : [0, 5, 7, 0],
      pop: minor ? [0, 8, 3, 10, 0] : [0, 7, 9, 5, 0]
    };
    return { tonic: tonic, minor: minor, degrees: map[kind] || map.cadential, quality: minor ? "minor" : "major" };
  }

  function makeIdentifyQuestion(opts) {
    opts = opts || {};
    var level = levelById(opts.level || 1);
    var rng = opts.rng;
    var pair = pickTonicAndScale(level, rng, opts);
    var boards = opts.board ? [opts.board] : level.boards;
    var patterns = patternsForQuestion(level, opts);
    var count = opts.circleCount || level.circleCount;
    var guard = 0, q = null;
    while (!q && guard < 80) {
      guard++;
      var board = rngPick(boards, rng);
      var pattern = rngPick(patterns, rng);
      var an = T.anchorFrets(pair.tonic, pair.scale, pattern, T.TUNINGS[board].frets);
      if (!an.anchors.length) continue;
      var anchor = opts.statedAnchor != null && an.anchors.indexOf(opts.statedAnchor) >= 0
        ? opts.statedAnchor
        : (an.anchors.length > 1 ? an.anchors[an.anchors.length - 1] : an.anchors[0]);
      var notes = notesInBox(board, pair.tonic, pair.scale, pattern, anchor);
      var circled = opts.targets || pickCircled(notes, count, rng);
      if (!circled || circled.length < count) continue;
      q = {
        kind: "identify",
        level: level.id,
        board: board,
        tonic: pair.tonic,
        scale: pair.scale,
        pattern: pattern,
        anchors: an.anchors.slice(),
        statedAnchor: anchor,
        box: { lo: anchor, hi: anchor + T.BOX_SPAN },
        targets: circled.map(function (n) {
          return { string: n.string, fret: n.fret, degree: n.degree, name: n.name, midi: n.midi, tonic: n.tonic, key: n.string + "-" + n.fret };
        }),
        boxNotes: notes.map(function (n) {
          return { string: n.string, fret: n.fret, degree: n.degree, name: n.name, midi: n.midi, tonic: n.tonic, key: n.string + "-" + n.fret };
        }),
        hint: hintForQuestion(level, opts)
      };
      q.prompt = identifyPrompt(q);
    }
    return q;
  }

  function degreesPresent(notes) {
    var set = {};
    notes.forEach(function (n) { set[n.degree] = true; });
    return set;
  }

  function pickFragment(scaleId, notes, minLen, rng) {
    var list = (FIND_FRAGMENTS[scaleId] || FIND_FRAGMENTS.major).slice();
    var present = degreesPresent(notes);
    var ok = list.filter(function (frag) {
      if (minLen && frag.length < minLen) return false;
      return frag.every(function (d) { return present[d]; });
    });
    if (!ok.length) {
      // 退而求其次：從把位裡依弦、格排，取 3 個不同級數
      var uniq = [];
      var seen = {};
      notes.slice().sort(function (a, b) { return a.string - b.string || a.fret - b.fret; }).forEach(function (n) {
        if (!seen[n.degree]) { seen[n.degree] = 1; uniq.push(n.degree); }
      });
      if (uniq.length >= 3) return uniq.slice(0, Math.min(4, uniq.length));
      return null;
    }
    return rngPick(ok, rng);
  }

  function makeFindQuestion(opts) {
    opts = opts || {};
    var level = levelById(opts.level || 3);
    var rng = opts.rng;
    var pair = pickTonicAndScale(level, rng, opts);
    var boards = opts.board ? [opts.board] : level.boards;
    var patterns = patternsForQuestion(level, opts);
    var guard = 0, q = null;
    while (!q && guard < 80) {
      guard++;
      var board = rngPick(boards, rng);
      var pattern = rngPick(patterns, rng);
      var an = T.anchorFrets(pair.tonic, pair.scale, pattern, T.TUNINGS[board].frets);
      if (!an.anchors.length) continue;
      var anchor = opts.statedAnchor != null && an.anchors.indexOf(opts.statedAnchor) >= 0
        ? opts.statedAnchor
        : (an.anchors.length > 1 ? an.anchors[an.anchors.length - 1] : an.anchors[0]);
      var notes = notesInBox(board, pair.tonic, pair.scale, pattern, anchor);
      var frag = opts.targetDegrees || pickFragment(pair.scale, notes, 3, rng);
      if (!frag) continue;
      var progKind = opts.progKind || "cadential";
      q = {
        kind: "find",
        level: level.id,
        board: board,
        tonic: pair.tonic,
        scale: pair.scale,
        pattern: pattern,
        anchors: an.anchors.slice(),
        statedAnchor: anchor,
        box: { lo: anchor, hi: anchor + T.BOX_SPAN },
        targetDegrees: frag.slice(),
        progression: fixedProgressionFor(pair.tonic, pair.scale, progKind),
        boxNotes: notes.map(function (n) {
          return { string: n.string, fret: n.fret, degree: n.degree, name: n.name, midi: n.midi, tonic: n.tonic, key: n.string + "-" + n.fret };
        }),
        hint: hintForQuestion(level, opts)
      };
      q.prompt = findPrompt(q);
    }
    return q;
  }

  function randomQuizQuestion(opts) {
    opts = opts || {};
    var level = levelById(opts.level || 1);
    var types = opts.kind ? [opts.kind] : level.types;
    var kind = rngPick(types, opts.rng);
    return kind === "find" ? makeFindQuestion(opts) : makeIdentifyQuestion(opts);
  }

  function gradeIdentify(clicks, question) {
    var expMap = {};
    question.targets.forEach(function (t) { expMap[t.key] = t; });
    var seen = {}, correct = [], wrongName = [], extra = [], missing;
    (clicks || []).forEach(function (c) {
      var key = c.string + "-" + c.fret;
      if (seen[key]) return;
      seen[key] = true;
      var got = (c.degree != null && c.degree !== "") ? c.degree : c.name;
      var exp = expMap[key];
      if (!exp) extra.push({ string: c.string, fret: c.fret, name: got, degree: got });
      else if (got === exp.degree) correct.push({ string: c.string, fret: c.fret, name: exp.degree, degree: exp.degree, letter: exp.name });
      else wrongName.push({ string: c.string, fret: c.fret, name: got, degree: got, expected: exp.degree, letter: exp.name });
    });
    missing = question.targets.filter(function (t) { return !seen[t.key]; }).map(function (t) {
      return { string: t.string, fret: t.fret, name: t.degree, degree: t.degree, letter: t.name, key: t.key };
    });
    var total = question.targets.length;
    var score = Math.max(0, correct.length - extra.length);
    var pct = total ? Math.round(100 * score / total) : 0;
    return {
      kind: "identify",
      correct: correct, wrongName: wrongName, extra: extra, missing: missing,
      expectedCount: total, score: score, percent: pct,
      perfect: missing.length === 0 && extra.length === 0 && wrongName.length === 0
    };
  }

  function gradeFind(clicks, question) {
    var byDeg = {};
    question.boxNotes.forEach(function (n) {
      if (question.targetDegrees.indexOf(n.degree) < 0) return;
      if (!byDeg[n.degree]) byDeg[n.degree] = [];
      byDeg[n.degree].push(n);
    });
    var targetSet = {};
    question.targetDegrees.forEach(function (d) { targetSet[d] = 1; });
    var posMap = {};
    question.boxNotes.forEach(function (n) { posMap[n.key] = n; });
    var seen = {}, correct = [], extra = [];
    var found = {};
    (clicks || []).forEach(function (c) {
      var key = c.string + "-" + c.fret;
      if (seen[key]) return;
      seen[key] = true;
      var rec = posMap[key];
      if (rec && targetSet[rec.degree]) {
        correct.push({ string: rec.string, fret: rec.fret, name: rec.degree, degree: rec.degree, letter: rec.name });
        found[rec.degree] = 1;
      } else {
        extra.push({ string: c.string, fret: c.fret, name: rec ? rec.degree : (c.degree || c.name), degree: rec ? rec.degree : (c.degree || c.name) });
      }
    });
    var missing = [];
    question.targetDegrees.forEach(function (d) {
      if (found[d]) return;
      var opts = byDeg[d] || [];
      var sample = opts[0];
      missing.push({
        degree: d, name: d,
        string: sample ? sample.string : null,
        fret: sample ? sample.fret : null,
        letter: sample ? sample.name : "",
        candidates: opts.map(function (n) { return n.key; })
      });
    });
    var total = question.targetDegrees.length;
    var score = Math.max(0, Object.keys(found).length - extra.length);
    var pct = total ? Math.round(100 * score / total) : 0;
    return {
      kind: "find",
      correct: correct, wrongName: [], extra: extra, missing: missing,
      foundDegrees: Object.keys(found),
      expectedCount: total, score: score, percent: pct,
      perfect: missing.length === 0 && extra.length === 0
    };
  }

  function gradeQuizQuestion(clicks, question) {
    if (!question) return null;
    if (question.kind === "find") return gradeFind(clicks, question);
    if (question.kind === "identify") return gradeIdentify(clicks, question);
    // 舊題型後援
    return T.gradeQuiz(clicks, question);
  }

  // 瀏覽調式時的聽法：先上行音階，再配一個短的進行（讓孩子聽特色）
  function modeListenPlan(tonic, scaleId) {
    var spelled = T.spellScale(tonic, scaleId);
    var scaleMidis = spelled.notes.map(function (n) { return 60 + ((n.pc - 0 + 12) % 12); });
    // 排成從主音往上的一組（C4 附近）
    var tonicPc = spelled.tonic.pc;
    var up = spelled.notes.map(function (n) {
      var m = 60 + n.pc;
      if (m < 60 + tonicPc) m += 12;
      return m;
    });
    up.push((60 + tonicPc) + 12);
    var vamps = {
      dorian: [0, 5, 0, 5],       // i - IV
      phrygian: [0, 1, 0, 1],     // i - bII
      lydian: [0, 2, 0, 2],       // I - II
      mixolydian: [0, 10, 0, 10], // I - bVII
      locrian: [0, 1, 0, 1]       // i(b5) 用 i - bII 帶過
    };
    return {
      tonic: tonic,
      scale: scaleId,
      scaleMidis: up,
      vampDegrees: vamps[scaleId] || [0, 5, 7, 0],
      minorColor: T.isMinorSystem(scaleId)
    };
  }

  T.QUIZ_LEVELS = QUIZ_LEVELS;
  T.MODE_SCALE_IDS = MODE_SCALE_IDS;
  T.FIND_FRAGMENTS = FIND_FRAGMENTS;
  T.levelById = levelById;
  T.patternsForQuestion = patternsForQuestion;
  T.hintForQuestion = hintForQuestion;
  T.keyAndScaleTitle = keyAndScaleTitle;
  T.makeIdentifyQuestion = makeIdentifyQuestion;
  T.makeFindQuestion = makeFindQuestion;
  T.randomQuizQuestion = randomQuizQuestion;
  T.gradeIdentify = gradeIdentify;
  T.gradeFind = gradeFind;
  T.gradeQuizQuestion = gradeQuizQuestion;
  T.fixedProgressionFor = fixedProgressionFor;
  T.modeListenPlan = modeListenPlan;
  T.isModeScale = function (id) { return MODE_SCALE_IDS.indexOf(id) >= 0; };

  root.__fretTheory = T;
  if (typeof module !== "undefined" && module.exports) module.exports = T;
})(typeof window !== "undefined" ? window : globalThis);
