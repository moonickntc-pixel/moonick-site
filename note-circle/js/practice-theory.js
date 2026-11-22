/* 十二音圓形音階：抓歌練習（出題與批改，可在 Node 跑測試） */
(function (root) {
  "use strict";

  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var MAJOR_IV = [0, 2, 4, 5, 7, 9, 11];
  var NAT_MINOR_IV = [0, 2, 3, 5, 7, 8, 10];
  var MAJOR_TRIAD = ["maj", "m", "m", "maj", "maj", "m", "dim"];
  var MINOR_TRIAD = ["m", "dim", "maj", "m", "m", "maj", "maj"];
  var CHORD_IV = {
    maj: [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6],
    "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10]
  };
  var CHORD_SUF = { maj: "", m: "m", dim: "dim", "7": "7", maj7: "maj7", m7: "m7" };
  var MINOR_SHOU = ["6", "7", "1", "2", "3", "4", "5"]; // 首調：小調主音是 6
  // 和弦級數：首調數字加性質（Nashville）。大調 1、2m、3m、4、5、6m、7dim；小調主和弦是 6m。
  var MAJOR_SHOU_CHORD = ["1", "2m", "3m", "4", "5", "6m", "7dim"];
  var MINOR_SHOU_CHORD = ["6m", "7dim", "1", "2m", "3m", "4", "5"];
  function shouChordLabel(quality, degree) {
    var list = quality === "minor" ? MINOR_SHOU_CHORD : MAJOR_SHOU_CHORD;
    return list[degree - 1];
  }
  function degreeFromShou(quality, label) {
    if (typeof label === "number" && label >= 1 && label <= 7) return label;
    var list = quality === "minor" ? MINOR_SHOU_CHORD : MAJOR_SHOU_CHORD;
    var i = list.indexOf(String(label));
    if (i >= 0) return i + 1;
    var n = parseInt(label, 10);
    return n >= 1 && n <= 7 ? n : 1;
  }

  var MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"];
  var MINOR_KEYS = ["A", "E", "B", "F#", "C#", "G#", "D#", "D", "G", "C", "F", "Bb"];

  var LEVELS = [
    { id: 1, name: "第 1 級　起步", blurb: "最常見的大調與小調，和弦先考大三、小三。",
      majors: ["C", "G", "F"], minors: ["A", "E", "D"],
      chordTypes: ["maj", "m"], degrees: [1, 4, 5, 6], streakToUp: 3 },
    { id: 2, name: "第 2 級　多一點調", blurb: "再多幾個調，也會考七和弦與其他級數。",
      majors: ["C", "G", "D", "A", "F", "Bb"], minors: ["A", "E", "B", "D", "G", "C"],
      chordTypes: ["maj", "m", "7", "maj7", "m7"], degrees: [1, 2, 3, 4, 5, 6, 7], streakToUp: 3 },
    { id: 3, name: "第 3 級　再多一點", blurb: "十二個大調與十二個自然小調都會出現。",
      majors: MAJOR_KEYS.slice(), minors: MINOR_KEYS.slice(),
      chordTypes: ["maj", "m", "7", "maj7", "m7"], degrees: [1, 2, 3, 4, 5, 6, 7], streakToUp: 4 }
  ];

  // 進行：四個和弦、結束在主和弦，並用齊 7 個自然音（避免關係大小調以外還有第二個候選）。
  var MAJOR_PROGS = {
    cadential: [1, 4, 5, 1], // I IV V I
    popEnd: [4, 5, 6, 1]     // IV V vi I
  };
  var MINOR_PROGS = {
    cadential: [1, 4, 7, 1], // i iv VII i
    popEnd: [1, 6, 7, 1]     // i VI VII i
  };

  // 旋律：含全部 7 個級數，結束在主音
  var MELODIES = [
    [1, 2, 3, 4, 5, 6, 7, 1],
    [1, 3, 5, 6, 7, 6, 5, 4, 3, 2, 1],
    [5, 6, 7, 1, 2, 3, 4, 3, 2, 1],
    [1, 2, 3, 1, 4, 5, 6, 7, 1],
    [5, 4, 3, 2, 1, 6, 5, 4, 3, 2, 7, 1]
  ];

  function rngPick(arr, rng) {
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
  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return LEVELS[0];
  }
  function pcOf(name) {
    var acc = name.slice(1) === "#" ? 1 : name.slice(1) === "b" ? -1 : 0;
    return (LETTER_PC[name[0]] + acc + 12) % 12;
  }
  function accStr(diff) { return diff === 0 ? "" : diff > 0 ? new Array(diff + 1).join("#") : new Array(-diff + 1).join("b"); }
  function spellLetter(L, pc) {
    var diff = ((pc - LETTER_PC[L]) % 12 + 18) % 12 - 6;
    return L + accStr(diff);
  }
  function spellScale(tonicName, quality) {
    var letter = tonicName[0];
    var acc = tonicName.slice(1) === "#" ? 1 : tonicName.slice(1) === "b" ? -1 : 0;
    var tonicPc = (LETTER_PC[letter] + acc + 12) % 12;
    var li = LETTERS.indexOf(letter);
    var iv = quality === "minor" ? NAT_MINOR_IV : MAJOR_IV;
    var out = {};
    for (var d = 0; d < 7; d++) {
      var L = LETTERS[(li + d) % 7];
      var pc = (tonicPc + iv[d]) % 12;
      out[pc] = { name: spellLetter(L, pc), degree: d, pc: pc };
    }
    return { tonicPc: tonicPc, tonicName: tonicName, quality: quality, byPc: out };
  }
  function scalePcs(tonicName, quality) {
    var sp = spellScale(tonicName, quality);
    return Object.keys(sp.byPc).map(Number).sort(function (a, b) { return a - b; });
  }
  function isDiatonicPcs(pcs, tonicName, quality) {
    var set = {};
    scalePcs(tonicName, quality).forEach(function (p) { set[p] = 1; });
    return pcs.every(function (p) { return set[(p % 12 + 12) % 12]; });
  }
  function keyLabel(tonic, quality) {
    return quality === "minor" ? tonic + " 小調" : tonic + " 大調";
  }
  function chordName(rootName, typeId) {
    return rootName + (CHORD_SUF[typeId] || "");
  }
  function chordTonesOf(rootPc, typeId, tonicName, quality) {
    var iv = CHORD_IV[typeId];
    var rootName;
    if (tonicName) {
      var sp = spellScale(tonicName, quality || "major");
      rootName = sp.byPc[rootPc] ? sp.byPc[rootPc].name : spellLetter(["C","C","D","D","E","F","F","G","G","A","A","B"][rootPc], rootPc);
    } else {
      rootName = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][rootPc];
      if (typeId === "m" || typeId === "m7" || typeId === "dim") {
        rootName = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"][rootPc];
      }
    }
    var li = LETTERS.indexOf(rootName[0]);
    var steps = typeId === "maj" || typeId === "m" || typeId === "dim" ? [0, 2, 4] : [0, 2, 4, 6];
    var tones = iv.map(function (sem, i) {
      return spellLetter(LETTERS[(li + steps[i]) % 7], (rootPc + sem) % 12);
    });
    var pcs = iv.map(function (sem) { return (rootPc + sem) % 12; });
    return { rootPc: rootPc, type: typeId, name: chordName(rootName, typeId), tones: tones, pcs: pcs };
  }
  function diatonicChords(tonicName, quality) {
    var sp = spellScale(tonicName, quality);
    var types = quality === "minor" ? MINOR_TRIAD : MAJOR_TRIAD;
    var iv = quality === "minor" ? NAT_MINOR_IV : MAJOR_IV;
    return types.map(function (t, i) {
      var rootPc = (sp.tonicPc + iv[i]) % 12;
      var info = chordTonesOf(rootPc, t, tonicName, quality);
      info.degree = i + 1;
      info.shouLabel = shouChordLabel(quality, i + 1);
      return info;
    });
  }
  function progressionChords(tonicName, quality, kind) {
    var seq = (quality === "minor" ? MINOR_PROGS : MAJOR_PROGS)[kind || "cadential"];
    var diat = diatonicChords(tonicName, quality);
    return seq.map(function (deg) { return diat[deg - 1]; });
  }
  function progressionPcs(chords) {
    var pcs = [];
    chords.forEach(function (c) {
      c.pcs.forEach(function (p) { if (pcs.indexOf(p) < 0) pcs.push(p); });
    });
    return pcs.sort(function (a, b) { return a - b; });
  }
  function keysMatchingPcs(pcs, quality, pool) {
    return pool.filter(function (nm) { return isDiatonicPcs(pcs, nm, quality); });
  }
  function lastIsTonic(chords, tonicName, quality) {
    var last = chords[chords.length - 1];
    if (!last) return false;
    var want = quality === "minor" ? "m" : "maj";
    return last.rootPc === pcOf(tonicName) && last.type === want;
  }

  // 在同品質的候選裡，這串和弦只能對上一個調，而且最後一個是該調主和弦。
  function assertUnambiguousProgression(chords, tonicName, quality, choices) {
    var pcs = progressionPcs(chords);
    var pool = (choices || []).map(function (c) { return c.name; });
    var hits = keysMatchingPcs(pcs, quality, pool);
    return {
      ok: hits.length === 1 && hits[0] === tonicName && lastIsTonic(chords, tonicName, quality),
      hits: hits,
      pcs: pcs
    };
  }

  function melodyPcs(tonicName, quality, degrees) {
    var iv = quality === "minor" ? NAT_MINOR_IV : MAJOR_IV;
    var t = pcOf(tonicName);
    return degrees.map(function (d) { return (t + iv[d - 1]) % 12; });
  }
  function assertUnambiguousMelody(degrees, tonicName, quality, choices) {
    var pcs = [];
    melodyPcs(tonicName, quality, degrees).forEach(function (p) {
      if (pcs.indexOf(p) < 0) pcs.push(p);
    });
    var pool = (choices || []).map(function (c) { return c.name; });
    var hits = keysMatchingPcs(pcs, quality, pool);
    var last = degrees[degrees.length - 1];
    return { ok: hits.length === 1 && hits[0] === tonicName && last === 1, hits: hits, pcs: pcs };
  }

  function makeChoices(correct, quality, level, rng) {
    var pool = (quality === "minor" ? level.minors : level.majors).filter(function (n) { return n !== correct; });
    var others = shuffle(pool, rng).slice(0, 3);
    // 不夠就從完整名單補
    if (others.length < 3) {
      var all = (quality === "minor" ? MINOR_KEYS : MAJOR_KEYS).filter(function (n) { return n !== correct && others.indexOf(n) < 0; });
      others = others.concat(shuffle(all, rng).slice(0, 3 - others.length));
    }
    return shuffle([{ name: correct, quality: quality, correct: true }].concat(
      others.map(function (n) { return { name: n, quality: quality, correct: false }; })
    ), rng);
  }

  function makeKeyFromChordsQuestion(opts) {
    opts = opts || {};
    var level = levelById(opts.level || 1);
    var rng = opts.rng;
    var quality = opts.quality || rngPick(["major", "minor"], rng);
    var pool = quality === "minor" ? level.minors : level.majors;
    var tonic = opts.tonic || rngPick(pool, rng);
    var kind = opts.progKind || rngPick(["cadential", "popEnd"], rng);
    var chords = progressionChords(tonic, quality, kind);
    var choices = makeChoices(tonic, quality, level, rng);
    var check = assertUnambiguousProgression(chords, tonic, quality, choices);
    if (!check.ok) return null;
    return {
      kind: "keyFromChords",
      level: level.id,
      tonic: tonic,
      quality: quality,
      progKind: kind,
      chords: chords,
      choices: choices,
      answer: { name: tonic, quality: quality },
      prompt: {
        kicker: "先聽這四個和弦",
        title: quality === "minor" ? "這是哪個小調？" : "這是哪個大調？",
        ask: "進行會停在主和弦上。請選一個" + (quality === "minor" ? "小調" : "大調") + "。"
      },
      jam: { kind: "chords", tonic: tonic, quality: quality, chords: chords }
    };
  }

  function makeKeyFromMelodyQuestion(opts) {
    opts = opts || {};
    var level = levelById(opts.level || 1);
    var rng = opts.rng;
    var quality = opts.quality || rngPick(["major", "minor"], rng);
    var pool = quality === "minor" ? level.minors : level.majors;
    var tonic = opts.tonic || rngPick(pool, rng);
    var degrees = opts.degrees || rngPick(MELODIES, rng);
    var choices = makeChoices(tonic, quality, level, rng);
    var check = assertUnambiguousMelody(degrees, tonic, quality, choices);
    if (!check.ok) return null;
    return {
      kind: "keyFromMelody",
      level: level.id,
      tonic: tonic,
      quality: quality,
      degrees: degrees.slice(),
      pcs: melodyPcs(tonic, quality, degrees),
      choices: choices,
      answer: { name: tonic, quality: quality },
      prompt: {
        kicker: "先聽這段旋律",
        title: quality === "minor" ? "這是哪個小調？" : "這是哪個大調？",
        ask: "旋律會停在主音上。請選一個" + (quality === "minor" ? "小調" : "大調") + "。"
      },
      jam: {
        kind: "melody",
        tonic: tonic,
        quality: quality,
        degrees: degrees.slice(),
        pcs: melodyPcs(tonic, quality, degrees),
        chords: diatonicChords(tonic, quality)
      }
    };
  }

  function makeChordTonesQuestion(opts) {
    opts = opts || {};
    var level = levelById(opts.level || 1);
    var rng = opts.rng;
    var types = opts.type ? [opts.type] : level.chordTypes;
    var type = rngPick(types, rng);
    var qualityHint = (type === "m" || type === "m7" || type === "dim") ? "minor" : "major";
    var pool = qualityHint === "minor" ? level.minors : level.majors;
    var tonic = opts.tonic || rngPick(pool, rng);
    var rootPc = opts.rootPc != null ? opts.rootPc : pcOf(tonic);
    var info = chordTonesOf(rootPc, type);
    if (opts.chordName) {
      // 若指定名稱，以名稱為準
      info.name = opts.chordName;
    }
    return {
      kind: "chordTones",
      level: level.id,
      chord: info,
      answerPcs: info.pcs.slice(),
      prompt: {
        kicker: "看和弦名稱",
        title: info.name,
        ask: "請在圓上點出這個和弦的組成音（再點一次可以取消）。"
      }
    };
  }

  function makeDegreeChordQuestion(opts) {
    opts = opts || {};
    var level = levelById(opts.level || 1);
    var rng = opts.rng;
    var quality = opts.quality || rngPick(["major", "minor"], rng);
    var pool = quality === "minor" ? level.minors : level.majors;
    var tonic = opts.tonic || rngPick(pool, rng);
    var rawDeg = opts.degree != null ? opts.degree : rngPick(level.degrees, rng);
    var degree = degreeFromShou(quality, rawDeg);
    var diat = diatonicChords(tonic, quality);
    var correct = diat[degree - 1];
    var shou = correct.shouLabel;
    // 干擾項：同調其他級數
    var others = diat.filter(function (c, i) { return i !== degree - 1; });
    var choiceChords = shuffle(others, rng).slice(0, 3);
    choiceChords.push(correct);
    var choices = shuffle(choiceChords.map(function (c) {
      return { name: c.name, degree: c.degree, shouLabel: c.shouLabel, correct: c.degree === degree };
    }), rng);
    return {
      kind: "degreeChord",
      level: level.id,
      tonic: tonic,
      quality: quality,
      degree: degree,
      shouLabel: shou,
      answer: correct.name,
      correctChord: correct,
      choices: choices,
      prompt: {
        kicker: "看調性與級數",
        title: keyLabel(tonic, quality) + " " + shou,
        ask: keyLabel(tonic, quality) + " " + shou + " 是哪個和弦？"
      }
    };
  }

  function randomPracticeQuestion(opts) {
    opts = opts || {};
    var kinds = opts.kind ? [opts.kind] : ["keyFromChords", "keyFromMelody", "chordTones", "degreeChord"];
    var kind = rngPick(kinds, opts.rng);
    var guard = 0, q = null;
    while (!q && guard < 40) {
      guard++;
      if (kind === "keyFromChords") q = makeKeyFromChordsQuestion(opts);
      else if (kind === "keyFromMelody") q = makeKeyFromMelodyQuestion(opts);
      else if (kind === "chordTones") q = makeChordTonesQuestion(opts);
      else q = makeDegreeChordQuestion(opts);
    }
    return q;
  }

  function sameKey(a, b) {
    return a && b && a.name === b.name && a.quality === b.quality;
  }
  function gradeKeyChoice(choice, question) {
    var ok = choice && choice.name === question.answer.name && choice.quality === question.answer.quality;
    return { kind: question.kind, perfect: !!ok, correct: !!ok, answer: question.answer, given: choice };
  }
  function gradeChordTones(pickedPcs, question) {
    var need = question.answerPcs.slice().sort(function (a, b) { return a - b; });
    var seen = {}, got = [];
    (pickedPcs || []).forEach(function (p) {
      p = (p % 12 + 12) % 12;
      if (seen[p]) return;
      seen[p] = 1;
      got.push(p);
    });
    got.sort(function (a, b) { return a - b; });
    var missing = need.filter(function (p) { return !seen[p]; });
    var extra = got.filter(function (p) { return need.indexOf(p) < 0; });
    var correct = need.filter(function (p) { return seen[p]; });
    return {
      kind: "chordTones",
      perfect: missing.length === 0 && extra.length === 0,
      correct: correct, missing: missing, extra: extra,
      expectedCount: need.length
    };
  }
  function gradeDegreeChord(choiceName, question) {
    var ok = choiceName === question.answer;
    return { kind: "degreeChord", perfect: !!ok, correct: !!ok, answer: question.answer, given: choiceName };
  }
  function gradePracticeQuestion(answer, question) {
    if (!question) return null;
    if (question.kind === "keyFromChords" || question.kind === "keyFromMelody") return gradeKeyChoice(answer, question);
    if (question.kind === "chordTones") return gradeChordTones(answer, question);
    if (question.kind === "degreeChord") return gradeDegreeChord(answer, question);
    return null;
  }

  // Jam 可切換的音階（大調／小調各一組；數字是首調：大調主音 1，小調主音 6）
  var JAM_SCALES = {
    major:    { id: "major",    quality: "major", name: "自然大調", short: "自然大調",
                notes: [{iv:0,deg:"1"},{iv:2,deg:"2"},{iv:4,deg:"3"},{iv:5,deg:"4"},{iv:7,deg:"5"},{iv:9,deg:"6"},{iv:11,deg:"7"}] },
    majPent:  { id: "majPent",  quality: "major", name: "大調五聲", short: "大調五聲",
                notes: [{iv:0,deg:"1"},{iv:2,deg:"2"},{iv:4,deg:"3"},{iv:7,deg:"5"},{iv:9,deg:"6"}] },
    majBlues: { id: "majBlues", quality: "major", name: "大調藍調", short: "大調藍調",
                notes: [{iv:0,deg:"1"},{iv:2,deg:"2"},{iv:3,deg:"b3"},{iv:4,deg:"3"},{iv:7,deg:"5"},{iv:9,deg:"6"}] },
    natMinor: { id: "natMinor", quality: "minor", name: "自然小調", short: "自然小調",
                notes: [{iv:0,deg:"6"},{iv:2,deg:"7"},{iv:3,deg:"1"},{iv:5,deg:"2"},{iv:7,deg:"3"},{iv:8,deg:"4"},{iv:10,deg:"5"}] },
    minPent:  { id: "minPent",  quality: "minor", name: "小調五聲", short: "小調五聲",
                notes: [{iv:0,deg:"6"},{iv:3,deg:"1"},{iv:5,deg:"2"},{iv:7,deg:"3"},{iv:10,deg:"5"}] },
    blues:    { id: "blues",    quality: "minor", name: "藍調", short: "藍調",
                notes: [{iv:0,deg:"6"},{iv:3,deg:"1"},{iv:5,deg:"2"},{iv:6,deg:"b3"},{iv:7,deg:"3"},{iv:10,deg:"5"}] },
    harMinor: { id: "harMinor", quality: "minor", name: "和聲小調", short: "和聲小調",
                notes: [{iv:0,deg:"6"},{iv:2,deg:"7"},{iv:3,deg:"1"},{iv:5,deg:"2"},{iv:7,deg:"3"},{iv:8,deg:"4"},{iv:11,deg:"#5"}] },
    melMinor: { id: "melMinor", quality: "minor", name: "旋律小調", short: "旋律小調",
                notes: [{iv:0,deg:"6"},{iv:2,deg:"7"},{iv:3,deg:"1"},{iv:5,deg:"2"},{iv:7,deg:"3"},{iv:9,deg:"#4"},{iv:11,deg:"#5"}] }
  };
  var DEG_LETTER_MAJOR = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6 };
  var DEG_LETTER_MINOR = { "6": 0, "7": 1, "1": 2, "2": 3, "3": 4, "4": 5, "5": 6 };
  function jamScaleById(id) { return JAM_SCALES[id] || null; }
  function defaultJamScale(quality) { return quality === "minor" ? "natMinor" : "major"; }
  function jamScalesFor(quality) {
    var ids = quality === "minor"
      ? ["natMinor", "minPent", "blues", "harMinor", "melMinor"]
      : ["major", "majPent", "majBlues"];
    return ids.map(function (id) { return JAM_SCALES[id]; });
  }
  function isJamScaleFor(id, quality) {
    var sc = JAM_SCALES[id];
    return !!(sc && sc.quality === (quality === "minor" ? "minor" : "major"));
  }
  function degFamily(deg) {
    return String(deg).replace(/^#+/, "").replace(/^b+/, "");
  }
  function spellJamScale(tonicName, scaleId) {
    var quality = (JAM_SCALES[scaleId] && JAM_SCALES[scaleId].quality) || (scaleId === "minor" ? "minor" : "major");
    if (!JAM_SCALES[scaleId]) scaleId = defaultJamScale(quality);
    var sc = JAM_SCALES[scaleId];
    var tonicPc = pcOf(tonicName);
    var letterMap = sc.quality === "minor" ? DEG_LETTER_MINOR : DEG_LETTER_MAJOR;
    var li0 = LETTERS.indexOf(tonicName[0]);
    var byPc = {};
    sc.notes.forEach(function (n) {
      var pc = (tonicPc + n.iv) % 12;
      var steps = letterMap[degFamily(n.deg)];
      if (steps == null) steps = 0;
      var L = LETTERS[(li0 + steps) % 7];
      byPc[pc] = { name: spellLetter(L, pc), degree: n.deg, label: n.deg, pc: pc, iv: n.iv };
    });
    return { tonicPc: tonicPc, tonicName: tonicName, scaleId: sc.id, quality: sc.quality, name: sc.name, byPc: byPc };
  }
  function jamLegendText(tonicName, scaleId) {
    var sc = jamScaleById(scaleId);
    if (!sc) sc = jamScaleById(defaultJamScale("major"));
    var typ = {
      major: "自然", majPent: "五聲", majBlues: "藍調",
      natMinor: "自然", minPent: "五聲", blues: "藍調",
      harMinor: "和聲", melMinor: "旋律"
    }[sc.id] || "";
    if (sc.id === "natMinor" || sc.id === "harMinor" || sc.id === "melMinor") {
      return tonicName + " " + typ + "小調音階";
    }
    return keyLabel(tonicName, sc.quality) + typ + "音階";
  }


  var api = {
    LEVELS: LEVELS, MAJOR_KEYS: MAJOR_KEYS, MINOR_KEYS: MINOR_KEYS,
    MAJOR_PROGS: MAJOR_PROGS, MINOR_PROGS: MINOR_PROGS, MELODIES: MELODIES,
    CHORD_IV: CHORD_IV, MINOR_SHOU: MINOR_SHOU, MAJOR_SHOU_CHORD: MAJOR_SHOU_CHORD, MINOR_SHOU_CHORD: MINOR_SHOU_CHORD,
    shouChordLabel: shouChordLabel, degreeFromShou: degreeFromShou,
    levelById: levelById, pcOf: pcOf, spellScale: spellScale, scalePcs: scalePcs,
    keyLabel: keyLabel, chordTonesOf: chordTonesOf, diatonicChords: diatonicChords,
    progressionChords: progressionChords, progressionPcs: progressionPcs,
    keysMatchingPcs: keysMatchingPcs, lastIsTonic: lastIsTonic,
    assertUnambiguousProgression: assertUnambiguousProgression,
    assertUnambiguousMelody: assertUnambiguousMelody, melodyPcs: melodyPcs,
    makeChoices: makeChoices,
    makeKeyFromChordsQuestion: makeKeyFromChordsQuestion,
    makeKeyFromMelodyQuestion: makeKeyFromMelodyQuestion,
    makeChordTonesQuestion: makeChordTonesQuestion,
    makeDegreeChordQuestion: makeDegreeChordQuestion,
    randomPracticeQuestion: randomPracticeQuestion,
    gradeKeyChoice: gradeKeyChoice, gradeChordTones: gradeChordTones,
    gradeDegreeChord: gradeDegreeChord, gradePracticeQuestion: gradePracticeQuestion,
    isDiatonicPcs: isDiatonicPcs,
    JAM_SCALES: JAM_SCALES, jamScaleById: jamScaleById, defaultJamScale: defaultJamScale,
    jamScalesFor: jamScalesFor, isJamScaleFor: isJamScaleFor, spellJamScale: spellJamScale,
    jamLegendText: jamLegendText
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__notePracticeTheory = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
