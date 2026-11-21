/* 吉他／Bass 音階工具：調性拼寫、音階、五指型、測驗批改（純邏輯，無 DOM） */
(function (root) {
  "use strict";

  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var KEYS = [
    { pc: 0, name: "C" },
    { pc: 1, name: "Db", enh: "C#" },
    { pc: 2, name: "D" },
    { pc: 3, name: "Eb" },
    { pc: 4, name: "E" },
    { pc: 5, name: "F" },
    { pc: 6, name: "F#", enh: "Gb" },
    { pc: 7, name: "G" },
    { pc: 8, name: "Ab" },
    { pc: 9, name: "A" },
    { pc: 10, name: "Bb" },
    { pc: 11, name: "B" }
  ];

  // 五指型：以關係大調的首調唱名，用最低弦（吉他 6 弦／Bass 4 弦，都是 E）上該把位的音來命名。
  // 五聲音階由低往高是 mi–sol–la–do–re，所以固定：
  // pattern 1 = mi 指型，2 = sol，3 = la，4 = do，5 = re。
  // 與老師舉例一致：E 小調的 la（主音 E）在 6 弦第 0／12 格 → la 指型（pattern 3）。
  var PATTERNS = [
    { id: 1, solfa: "mi", parentDeg: 2, label: "mi 指型（pattern 1）" },
    { id: 2, solfa: "sol", parentDeg: 4, label: "sol 指型（pattern 2）" },
    { id: 3, solfa: "la", parentDeg: 5, label: "la 指型（pattern 3）" },
    { id: 4, solfa: "do", parentDeg: 0, label: "do 指型（pattern 4）" },
    { id: 5, solfa: "re", parentDeg: 1, label: "re 指型（pattern 5）" }
  ];

  // parent：要找到「do」相對於主音的半音數與字母數（主音走到 do）。
  var SCALES = [
    { id: "major", name: "大調", quality: "major", iv: [0, 2, 4, 5, 7, 9, 11], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 0, parentSt: 0 },
    { id: "natMinor", name: "自然小調", quality: "minor", iv: [0, 2, 3, 5, 7, 8, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 3, parentSt: 2 },
    { id: "harMinor", name: "和聲小調", quality: "minor", iv: [0, 2, 3, 5, 7, 8, 11], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 3, parentSt: 2 },
    { id: "melMinor", name: "旋律小調", quality: "minor", iv: [0, 2, 3, 5, 7, 9, 11], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 3, parentSt: 2 },
    { id: "majPent", name: "大調五聲", quality: "major", iv: [0, 2, 4, 7, 9], st: [0, 1, 2, 4, 5], parentIv: 0, parentSt: 0 },
    { id: "minPent", name: "小調五聲", quality: "minor", iv: [0, 3, 5, 7, 10], st: [0, 2, 3, 4, 6], parentIv: 3, parentSt: 2 },
    { id: "blues", name: "藍調", quality: "minor", iv: [0, 3, 5, 6, 7, 10], st: [0, 2, 3, 4, 4, 6], parentIv: 3, parentSt: 2 },
    { id: "dorian", name: "Dorian（多利亞）", quality: "modal", iv: [0, 2, 3, 5, 7, 9, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: -2, parentSt: -1 },
    { id: "phrygian", name: "Phrygian（弗里吉亞）", quality: "modal", iv: [0, 1, 3, 5, 7, 8, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: -4, parentSt: -2 },
    { id: "lydian", name: "Lydian（利底亞）", quality: "modal", iv: [0, 2, 4, 6, 7, 9, 11], st: [0, 1, 2, 3, 4, 5, 6], parentIv: -5, parentSt: -3 },
    { id: "mixolydian", name: "Mixolydian（混合利底亞）", quality: "modal", iv: [0, 2, 4, 5, 7, 9, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: -7, parentSt: -4 },
    { id: "locrian", name: "Locrian（洛克里亞）", quality: "modal", iv: [0, 1, 3, 5, 6, 8, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 1, parentSt: 1 }
  ];

  var TUNINGS = {
    guitar: { id: "guitar", name: "吉他", stringCount: 6, openMidi: [40, 45, 50, 55, 59, 64], openName: ["E", "A", "D", "G", "B", "E"], frets: 16 },
    bass: { id: "bass", name: "Bass", stringCount: 4, openMidi: [28, 33, 38, 43], openName: ["E", "A", "D", "G"], frets: 16 }
  };
  var BOX_SPAN = 4; // 從錨點起算 5 格（含）：a .. a+4

  function parseTonic(name) {
    var letter = name[0];
    var rest = name.slice(1);
    var acc = rest === "#" ? 1 : rest === "b" ? -1 : rest === "##" ? 2 : rest === "bb" ? -2 : 0;
    return { letter: letter, acc: acc, pc: (LETTER_PC[letter] + acc + 12) % 12, name: name };
  }
  function accStr(diff) { return diff === 0 ? "" : diff > 0 ? new Array(diff + 1).join("#") : new Array(-diff + 1).join("b"); }
  function spellLetter(L, pc) {
    var diff = ((pc - LETTER_PC[L]) % 12 + 18) % 12 - 6;
    return L + accStr(diff);
  }
  function tonicNameOf(key, useEnh) {
    return useEnh && key.enh ? key.enh : key.name;
  }
  function scaleById(id) {
    for (var i = 0; i < SCALES.length; i++) if (SCALES[i].id === id) return SCALES[i];
    return null;
  }
  function patternById(id) {
    for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].id === id) return PATTERNS[i];
    return null;
  }
  function keyByName(name) {
    for (var i = 0; i < KEYS.length; i++) {
      if (KEYS[i].name === name || KEYS[i].enh === name) return KEYS[i];
    }
    return null;
  }

  function parentDo(tonicName, scaleId) {
    var sc = scaleById(scaleId);
    var t = parseTonic(tonicName);
    var li = LETTERS.indexOf(t.letter);
    var L = LETTERS[(li + sc.parentSt + 7) % 7];
    var pc = (t.pc + sc.parentIv % 12 + 12) % 12;
    return { name: spellLetter(L, pc), pc: pc };
  }

  function degreeLabel(iv, name, tonicLetter) {
    var table = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
    if (iv === 6) {
      // #4（利底亞，第 4 音字母）或 b5（藍調、Locrian，第 5 音字母）
      var li = LETTERS.indexOf(tonicLetter || (name && name[0]));
      var dist = name && name[0] && li >= 0 ? (LETTERS.indexOf(name[0]) - li + 7) % 7 : 4;
      return dist === 3 ? "#4" : "b5";
    }
    return table[iv] || String(iv);
  }

  function spellScale(tonicName, scaleId) {
    var sc = scaleById(scaleId);
    var t = parseTonic(tonicName);
    var li = LETTERS.indexOf(t.letter);
    var byPc = {};
    var notes = [];
    for (var i = 0; i < sc.iv.length; i++) {
      var L = LETTERS[(li + sc.st[i] + 7) % 7];
      var pc = (t.pc + sc.iv[i]) % 12;
      var name = spellLetter(L, pc);
      var deg = degreeLabel(sc.iv[i], name, t.letter);
      var rec = { pc: pc, name: name, degree: deg, iv: sc.iv[i], step: i };
      notes.push(rec);
      byPc[pc] = rec;
    }
    return { tonic: t, scale: sc, notes: notes, byPc: byPc, parent: parentDo(tonicName, scaleId) };
  }

  function anchorFrets(tonicName, scaleId, patternId, maxFret) {
    if (maxFret == null) maxFret = 16;
    var spelled = spellScale(tonicName, scaleId);
    var pat = patternById(patternId);
    var namesakePc = (spelled.parent.pc + MAJOR[pat.parentDeg]) % 12;
    var openPc = 4; // 最低弦都是 E
    var a = (namesakePc - openPc + 12) % 12;
    var out = [];
    if (a + BOX_SPAN <= maxFret) out.push(a);
    if (a + 12 + BOX_SPAN <= maxFret) out.push(a + 12);
    return { namesakePc: namesakePc, anchors: out, solfa: pat.solfa, pattern: pat.id };
  }

  function patternNotes(board, tonicName, scaleId, patternId, anchor) {
    var tun = TUNINGS[board];
    var spelled = spellScale(tonicName, scaleId);
    var lo = anchor, hi = anchor + BOX_SPAN;
    var notes = [];
    for (var s = 0; s < tun.stringCount; s++) {
      for (var f = lo; f <= hi && f <= tun.frets; f++) {
        if (f < 0) continue;
        var midi = tun.openMidi[s] + f;
        var pc = midi % 12;
        var rec = spelled.byPc[pc];
        if (!rec) continue;
        notes.push({
          string: s, // 0 = 最低弦
          fret: f,
          midi: midi,
          pc: pc,
          name: rec.name,
          degree: rec.degree,
          iv: rec.iv,
          tonic: rec.iv === 0
        });
      }
    }
    return notes;
  }

  function keyTitle(tonicName, scaleId) {
    var sc = scaleById(scaleId);
    if (sc.quality === "minor") return tonicName + " 小調";
    if (sc.quality === "major") return tonicName + " 大調";
    return tonicName;
  }

  function patternLabel(patternId) {
    var p = patternById(patternId);
    return p ? p.label : "";
  }

  function questionPrompt(q) {
    var pos = q.statedAnchor;
    var alt = q.anchors.filter(function (a) { return a !== pos; });
    var posText = "第 " + pos + " 格";
    if (alt.length) posText += "（或第 " + alt.join("、第 ") + " 格）";
    return TUNINGS[q.board].name + "｜" + keyTitle(q.tonic, q.scale) + "｜" + scaleById(q.scale).name + "音階｜" + patternLabel(q.pattern) + "｜請在" + posText + "把這個指型的音階音點出來，並選音名";
  }

  function answerSet(q, anchor) {
    return patternNotes(q.board, q.tonic, q.scale, q.pattern, anchor).map(function (n) {
      return { string: n.string, fret: n.fret, name: n.name, key: n.string + "-" + n.fret };
    });
  }

  // clicks: [{string, fret, name}]
  function gradeClicksAgainst(clicks, expected) {
    var expMap = {};
    expected.forEach(function (e) { expMap[e.key] = e; });
    var seen = {};
    var correct = [], wrongName = [], extra = [];
    (clicks || []).forEach(function (c) {
      var key = c.string + "-" + c.fret;
      if (seen[key]) return;
      seen[key] = true;
      var exp = expMap[key];
      if (!exp) extra.push({ string: c.string, fret: c.fret, name: c.name });
      else if (c.name === exp.name) correct.push({ string: c.string, fret: c.fret, name: c.name });
      else wrongName.push({ string: c.string, fret: c.fret, name: c.name, expected: exp.name });
    });
    var missing = expected.filter(function (e) { return !seen[e.key]; });
    var score = Math.max(0, correct.length - extra.length);
    var pct = expected.length ? Math.round(100 * score / expected.length) : 0;
    return {
      correct: correct, wrongName: wrongName, extra: extra, missing: missing,
      expectedCount: expected.length, score: score, percent: pct, perfect: missing.length === 0 && extra.length === 0 && wrongName.length === 0
    };
  }

  function gradeQuiz(clicks, question) {
    var best = null;
    question.anchors.forEach(function (a) {
      var g = gradeClicksAgainst(clicks, answerSet(question, a));
      g.usedAnchor = a;
      if (!best || g.score > best.score || (g.score === best.score && g.wrongName.length + g.extra.length + g.missing.length < best.wrongName.length + best.extra.length + best.missing.length)) {
        best = g;
      }
    });
    return best;
  }

  function makeQuestion(opts) {
    opts = opts || {};
    var board = opts.board || "guitar";
    var tonic = opts.tonic;
    var scale = opts.scale || "harMinor";
    var pattern = opts.pattern || 3;
    var maxFret = TUNINGS[board].frets;
    var an = anchorFrets(tonic, scale, pattern, maxFret);
    if (!an.anchors.length) return null;
    var stated = opts.statedAnchor;
    if (stated == null) {
      stated = an.anchors.length > 1 ? an.anchors[an.anchors.length - 1] : an.anchors[0];
    }
    if (an.anchors.indexOf(stated) < 0) stated = an.anchors[0];
    var q = { board: board, tonic: tonic, scale: scale, pattern: pattern, anchors: an.anchors.slice(), statedAnchor: stated };
    q.prompt = questionPrompt(q);
    q.answers = {};
    an.anchors.forEach(function (a) { q.answers[a] = answerSet(q, a); });
    return q;
  }

  function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function randomQuestion(scope) {
    scope = scope || {};
    var boards = scope.boards && scope.boards.length ? scope.boards : ["guitar", "bass"];
    var scales = scope.scales && scope.scales.length ? scope.scales : SCALES.map(function (s) { return s.id; });
    var tonics = scope.tonics && scope.tonics.length ? scope.tonics : KEYS.map(function (k) { return tonicNameOf(k, !!scope.useEnh); });
    var patterns = scope.patterns && scope.patterns.length ? scope.patterns : [1, 2, 3, 4, 5];
    var board, tonic, scale, pattern, q, guard = 0;
    do {
      board = randomPick(boards);
      tonic = randomPick(tonics);
      scale = randomPick(scales);
      pattern = randomPick(patterns);
      q = makeQuestion({ board: board, tonic: tonic, scale: scale, pattern: pattern, statedAnchor: scope.statedAnchor });
      guard++;
    } while (!q && guard < 40);
    return q;
  }

  var api = {
    LETTERS: LETTERS, KEYS: KEYS, MAJOR: MAJOR, SCALES: SCALES, PATTERNS: PATTERNS, TUNINGS: TUNINGS, BOX_SPAN: BOX_SPAN,
    parseTonic: parseTonic, spellLetter: spellLetter, tonicNameOf: tonicNameOf,
    scaleById: scaleById, patternById: patternById, keyByName: keyByName,
    parentDo: parentDo, spellScale: spellScale, degreeLabel: degreeLabel,
    anchorFrets: anchorFrets, patternNotes: patternNotes,
    keyTitle: keyTitle, patternLabel: patternLabel, questionPrompt: questionPrompt,
    makeQuestion: makeQuestion, gradeQuiz: gradeQuiz, randomQuestion: randomQuestion,
    answerSet: answerSet
  };
  root.__fretTheory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
