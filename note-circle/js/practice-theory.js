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

  // 旋律輪廓：含全部 7 個級數。實際出題會另配 4/4 節奏，結尾音不一定是主音。
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
    return { ok: hits.length === 1 && hits[0] === tonicName, hits: hits, pcs: pcs };
  }

  // 調性線索：要有主音、主和弦音（1 3 5）與特徵音 4、7，才聽得出是哪個調。
  function melodyHasKeyClues(degrees) {
    var seen = {};
    (degrees || []).forEach(function (d) { seen[+d] = 1; });
    return !!(seen[1] && seen[3] && seen[5] && seen[4] && seen[7]);
  }

  // 結尾音權重：主音約 36%，3 與 5 為主，偶爾 2、6。不結束在 4、7。
  var MELODY_END_WEIGHTS = [[1, 36], [3, 24], [5, 24], [2, 8], [6, 8]];
  function pickMelodyEnding(rng) {
    var r = (rng || Math.random)() * 100, acc = 0, i;
    for (i = 0; i < MELODY_END_WEIGHTS.length; i++) {
      acc += MELODY_END_WEIGHTS[i][1];
      if (r < acc) return MELODY_END_WEIGHTS[i][0];
    }
    return 1;
  }

  function melodyMeterInfo(beats) {
    var meter = 4, measures = [], acc = 0, start = 0, i, b, items = [];
    beats = beats || [];
    for (i = 0; i < beats.length; i++) {
      b = +beats[i];
      if (!(b > 0)) return { ok: false, reason: "bad-beat", measures: measures, leftover: acc, totalBeats: 0 };
      if (Math.abs(start * 2 - Math.round(start * 2)) > 1e-6) {
        return { ok: false, reason: "off-grid", measures: measures, leftover: acc, totalBeats: 0 };
      }
      if (acc + b > meter + 1e-9) {
        return { ok: false, reason: "cross-bar", measures: measures, leftover: acc, totalBeats: 0 };
      }
      items.push(b);
      acc += b;
      start += b;
      if (Math.abs(acc - meter) < 1e-9) {
        measures.push({ beats: items.slice(), total: meter });
        items = [];
        acc = 0;
      }
    }
    var total = measures.length * meter;
    return {
      ok: acc < 1e-9 && measures.length > 0 && measures.every(function (m) { return Math.abs(m.total - meter) < 1e-9; }),
      measures: measures,
      leftover: acc,
      totalBeats: total,
      meter: meter
    };
  }

  function rngChoice(arr, rng) {
    var r = rng || Math.random;
    return arr[Math.floor(r() * arr.length)];
  }

  function fillMeasureBeats(n, rng, longLast) {
    var parts = [], i, slack = 8 - n, r = rng || Math.random, guard, nxt;
    if (n < 1) n = 1;
    if (n > 8) n = 8;
    for (i = 0; i < n; i++) parts.push(0.5);
    if (longLast) {
      var allowed = [0, 1, 2, 3, 5, 7].filter(function (a) { return a <= slack; });
      var add = allowed.length ? allowed[allowed.length - 1] : 0;
      parts[n - 1] += add * 0.5;
      slack -= add;
    }
    guard = 0;
    while (slack > 0 && guard++ < 80) {
      i = Math.floor(r() * (longLast && n > 1 ? n - 1 : n));
      nxt = parts[i] + 0.5;
      if (nxt > 4 + 1e-9) continue;
      if (Math.abs(nxt - 2.5) < 1e-9 || Math.abs(nxt - 3.5) < 1e-9) continue;
      parts[i] = nxt;
      slack -= 1;
    }
    if (slack > 0) parts[n - 1] += slack * 0.5;
    return parts;
  }

  function makeMelodyRhythm(noteCount, rng) {
    var r = rng || Math.random;
    var n = Math.max(1, noteCount | 0);
    var minBeats = n * 0.5;
    var measures = minBeats <= 4 ? (r() < 0.45 ? 1 : 2) : (minBeats <= 8 ? 2 : 4);
    if (n * 0.5 > measures * 4) measures = Math.ceil((n * 0.5) / 4);
    var left = n, m, counts = [], measLeft, beatsAfter, minThis, maxThis, c;
    for (m = 0; m < measures; m++) {
      measLeft = measures - m;
      beatsAfter = (measLeft - 1) * 4;
      minThis = Math.max(1, left - beatsAfter * 2, left - (measLeft - 1) * 8);
      maxThis = Math.min(left - (measLeft - 1), 8);
      if (minThis > maxThis) { minThis = 1; maxThis = Math.max(1, Math.min(left, 8)); }
      c = minThis + Math.floor(r() * (maxThis - minThis + 1));
      counts.push(c);
      left -= c;
    }
    if (left) counts[counts.length - 1] += left;
    var beats = [];
    for (m = 0; m < counts.length; m++) {
      beats = beats.concat(fillMeasureBeats(counts[m], r, m === counts.length - 1));
    }
    return beats;
  }

  function repairMelodyDegrees(degrees, ending) {
    var d = (degrees || []).slice(), need = [1, 3, 5, 4, 7], i, j, v, cnt;
    if (!d.length) d = [1, 2, 3, 4, 5, 6, 7, ending || 1];
    d[d.length - 1] = ending || d[d.length - 1] || 1;
    if (d.length >= 7) need = [1, 2, 3, 4, 5, 6, 7];
    for (i = 0; i < need.length; i++) {
      v = need[i];
      if (d.indexOf(v) >= 0) continue;
      for (j = 0; j < d.length - 1; j++) {
        cnt = 0;
        d.forEach(function (x) { if (x === d[j]) cnt++; });
        if (j === 0 && d[0] === 1) continue;
        if (cnt > 1 || need.indexOf(d[j]) < 0) { d[j] = v; break; }
      }
      if (d.indexOf(v) < 0 && d.length > 2) d[1] = v;
    }
    d[d.length - 1] = ending || d[d.length - 1];
    if (d.indexOf(1) < 0) d[0] = 1;
    return d;
  }

  function makeMelodyDegrees(length, ending, rng) {
    var r = rng || Math.random;
    var base = rngChoice(MELODIES, r).slice();
    var i, prev;
    if (base.length > length) base = base.slice(0, length);
    while (base.length < length) {
      i = 1 + Math.floor(r() * Math.max(1, base.length - 1));
      prev = base[i - 1] || 1;
      base.splice(i, 0, prev >= 7 ? prev - 1 : prev + 1);
    }
    return repairMelodyDegrees(base, ending);
  }

  function makePracticeMelody(rng) {
    var r = rng || Math.random;
    var ending = pickMelodyEnding(r);
    var length = 8 + Math.floor(r() * 5);
    var degrees, beats, info, guard = 0, clues;
    do {
      degrees = makeMelodyDegrees(length, ending, r);
      beats = makeMelodyRhythm(degrees.length, r);
      info = melodyMeterInfo(beats);
      clues = melodyHasKeyClues(degrees);
      guard++;
    } while (guard < 24 && (!info.ok || !clues || beats.length !== degrees.length));
    if (!info.ok || !clues || beats.length !== degrees.length) {
      degrees = repairMelodyDegrees([1, 2, 3, 4, 5, 6, 7, ending], ending);
      beats = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      info = melodyMeterInfo(beats);
    }
    return {
      degrees: degrees,
      beats: beats,
      totalBeats: info.totalBeats,
      lastDegree: degrees[degrees.length - 1],
      measures: info.measures
    };
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
    var mel = opts.melody || null;
    if (!mel) {
      if (opts.degrees) {
        var ending = opts.degrees[opts.degrees.length - 1];
        var beats = opts.beats || makeMelodyRhythm(opts.degrees.length, rng);
        mel = { degrees: opts.degrees.slice(), beats: beats, totalBeats: melodyMeterInfo(beats).totalBeats, lastDegree: ending };
      } else {
        mel = makePracticeMelody(rng);
      }
    }
    var degrees = mel.degrees;
    var beats = (mel.beats || []).slice();
    var choices = makeChoices(tonic, quality, level, rng);
    var check = assertUnambiguousMelody(degrees, tonic, quality, choices);
    var meter = melodyMeterInfo(beats);
    if (!check.ok || !melodyHasKeyClues(degrees) || !meter.ok) return null;
    var pcs = melodyPcs(tonic, quality, degrees);
    return {
      kind: "keyFromMelody",
      level: level.id,
      tonic: tonic,
      quality: quality,
      degrees: degrees.slice(),
      beats: beats,
      totalBeats: meter.totalBeats,
      lastDegree: degrees[degrees.length - 1],
      pcs: pcs,
      choices: choices,
      answer: { name: tonic, quality: quality },
      prompt: {
        kicker: "先聽這段旋律",
        title: quality === "minor" ? "這是哪個小調？" : "這是哪個大調？",
        ask: "仔細聽旋律的調性。請選一個" + (quality === "minor" ? "小調" : "大調") + "。"
      },
      jam: {
        kind: "melody",
        tonic: tonic,
        quality: quality,
        degrees: degrees.slice(),
        beats: beats,
        totalBeats: meter.totalBeats,
        pcs: pcs.slice(),
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
    var kinds = opts.kind ? [opts.kind] : (opts.kinds && opts.kinds.length ? opts.kinds.slice() : ["keyFromChords", "keyFromMelody"]);
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


  // ---------- 自由 Jam ----------
  var FREE_JAM_MAX = 16;
  var FREE_JAM_ENH = { "C#": "Db", "Db": "C#", "D#": "Eb", "Eb": "D#", "F#": "Gb", "Gb": "F#", "G#": "Ab", "Ab": "G#", "A#": "Bb", "Bb": "A#" };
  var FREE_JAM_RHYTHMS = [
    { id: "8beat",   name: "8 Beat",  meter: 4, subdiv: 2, swing: false, beats: [1, 2, 4], defaultBeats: 4 },
    { id: "16beat",  name: "16 Beat", meter: 4, subdiv: 4, swing: false, beats: [1, 2, 4], defaultBeats: 4 },
    { id: "shuffle", name: "Shuffle", meter: 4, subdiv: 2, swing: true,  beats: [1, 2, 4], defaultBeats: 4 },
    { id: "funk",    name: "Funk",    meter: 4, subdiv: 4, swing: false, beats: [1, 2, 4], defaultBeats: 4 },
    { id: "ballad",  name: "慢板",    meter: 4, subdiv: 2, swing: false, beats: [1, 2, 4], defaultBeats: 4 },
    { id: "waltz",   name: "華爾滋",  meter: 3, subdiv: 2, swing: false, beats: [1, 2, 3, 6], defaultBeats: 3 }
  ];
  // 電腦／手機鍵盤：低音 Z–M、中音 A–J、高音 Q–U，對應首調 1–7
  var FREE_JAM_KEY_ROWS = {
    high: ["Q", "W", "E", "R", "T", "Y", "U"],
    mid:  ["A", "S", "D", "F", "G", "H", "J"],
    low:  ["Z", "X", "C", "V", "B", "N", "M"]
  };
  var FREE_JAM_KEYS = {};
  ["low", "mid", "high"].forEach(function (row, ri) {
    FREE_JAM_KEY_ROWS[row].forEach(function (k, i) {
      FREE_JAM_KEYS[k] = { deg: String(i + 1), oct: ri - 1, row: row };
    });
  });

  function freeJamRhythmById(id) {
    for (var i = 0; i < FREE_JAM_RHYTHMS.length; i++) if (FREE_JAM_RHYTHMS[i].id === id) return FREE_JAM_RHYTHMS[i];
    return FREE_JAM_RHYTHMS[0];
  }
  function freeJamBeatOptions(rhythmId) { return freeJamRhythmById(rhythmId).beats.slice(); }
  function defaultFreeJamBeats(rhythmId) { return freeJamRhythmById(rhythmId).defaultBeats; }
  function clampFreeJamBeats(rhythmId, beats) {
    var r = freeJamRhythmById(rhythmId);
    var n = +beats;
    if (r.beats.indexOf(n) >= 0) return n;
    return r.defaultBeats;
  }
  function cycleFreeJamBeats(rhythmId, beats) {
    var opts = freeJamBeatOptions(rhythmId);
    var i = opts.indexOf(+beats);
    return opts[(i < 0 ? 0 : i + 1) % opts.length];
  }
  function tonicInQuality(name, quality) {
    var list = quality === "minor" ? MINOR_KEYS : MAJOR_KEYS;
    if (list.indexOf(name) >= 0) return name;
    var enh = FREE_JAM_ENH[name];
    if (enh && list.indexOf(enh) >= 0) return enh;
    return list[0];
  }
  function freeJamSlotLabel(shouLabel, chordName) {
    return shouLabel + " (" + chordName + ")";
  }
  function makeFreeJamSlot(tonicName, quality, degreeOrLabel, beats, rhythmId) {
    var degree = degreeFromShou(quality, degreeOrLabel);
    var ch = diatonicChords(tonicName, quality)[degree - 1];
    var b = beats == null ? defaultFreeJamBeats(rhythmId) : clampFreeJamBeats(rhythmId, beats);
    return {
      degree: ch.degree,
      shouLabel: ch.shouLabel,
      name: ch.name,
      rootPc: ch.rootPc,
      type: ch.type,
      tones: ch.tones.slice(),
      pcs: ch.pcs.slice(),
      beats: b,
      label: freeJamSlotLabel(ch.shouLabel, ch.name)
    };
  }
  function addFreeJamSlot(slots, tonicName, quality, degreeOrLabel, beats, rhythmId) {
    var list = (slots || []).slice();
    if (list.length >= FREE_JAM_MAX) return list;
    list.push(makeFreeJamSlot(tonicName, quality, degreeOrLabel, beats, rhythmId));
    return list;
  }
  function removeFreeJamSlot(slots, index) {
    return (slots || []).filter(function (_, i) { return i !== index; });
  }
  function setFreeJamSlotBeats(slots, index, beats, rhythmId) {
    return (slots || []).map(function (s, i) {
      if (i !== index) return s;
      var next = {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) next[k] = s[k];
      next.beats = clampFreeJamBeats(rhythmId, beats);
      return next;
    });
  }
  function retargetFreeJamSlots(slots, tonicName, quality, rhythmId) {
    return (slots || []).map(function (s) {
      return makeFreeJamSlot(tonicName, quality, s.shouLabel || s.degree, s.beats, rhythmId);
    });
  }
  function freeJamTotalBeats(slots) {
    return (slots || []).reduce(function (n, s) { return n + (s.beats || 0); }, 0);
  }
  function freeJamTotalSteps(slots, rhythmId) {
    return freeJamTotalBeats(slots) * freeJamRhythmById(rhythmId).subdiv;
  }
  function freeJamChordAtStep(slots, rhythmId, step) {
    var r = freeJamRhythmById(rhythmId);
    var total = freeJamTotalSteps(slots, rhythmId);
    if (!slots || !slots.length || total <= 0) return { index: -1, chord: null, atAttack: false, localStep: 0 };
    var s = ((step % total) + total) % total;
    var acc = 0;
    for (var i = 0; i < slots.length; i++) {
      var n = slots[i].beats * r.subdiv;
      if (s < acc + n) return { index: i, chord: slots[i], atAttack: s === acc, localStep: s - acc };
      acc += n;
    }
    return { index: slots.length - 1, chord: slots[slots.length - 1], atAttack: false, localStep: 0 };
  }
  function freeJamStepDurationBeats(rhythmId, step) {
    var r = freeJamRhythmById(rhythmId);
    if (r.swing) return step % 2 === 0 ? 2 / 3 : 1 / 3;
    return 1 / r.subdiv;
  }
  function freeJamElapsedBeats(rhythmId, fromStep, toStep) {
    var t = 0, i;
    for (i = fromStep; i < toStep; i++) t += freeJamStepDurationBeats(rhythmId, i);
    return t;
  }
  function freeJamBarStep(rhythmId, step) {
    var r = freeJamRhythmById(rhythmId);
    var bar = r.meter * r.subdiv;
    return ((step % bar) + bar) % bar;
  }
  function freeJamDrumHits(rhythmId, step) {
    var r = freeJamRhythmById(rhythmId);
    var i = freeJamBarStep(rhythmId, step);
    var kick = false, snare = false, hat = false, open = false;
    if (r.id === "8beat" || r.id === "shuffle") {
      kick = i === 0 || i === 4;
      snare = i === 2 || i === 6;
      hat = true;
      open = i === 6;
    } else if (r.id === "16beat") {
      kick = i === 0 || i === 8;
      snare = i === 4 || i === 12;
      hat = true;
      open = i === 14;
    } else if (r.id === "funk") {
      kick = i === 0 || i === 3 || i === 6 || i === 10;
      snare = i === 4 || i === 12;
      hat = true;
      open = i === 14;
    } else if (r.id === "ballad") {
      kick = i === 0;
      snare = i === 4;
      hat = i % 2 === 0;
      open = false;
    } else if (r.id === "waltz") {
      kick = i === 0;
      snare = i === 4;
      hat = i === 0 || i === 2 || i === 4;
      open = false;
    }
    return { kick: kick, snare: snare, hat: hat, open: open };
  }

  function freeJamKeySpec(key) {
    if (key == null) return null;
    return FREE_JAM_KEYS[String(key).toUpperCase()] || null;
  }
  function scaleNotesAscending(tonicName, scaleId) {
    var sp = spellJamScale(tonicName, scaleId);
    var tonicPc = sp.tonicPc;
    return Object.keys(sp.byPc).map(function (pc) {
      var info = sp.byPc[pc];
      return { pc: info.pc, info: info, rel: (info.pc - tonicPc + 12) % 12 };
    }).sort(function (a, b) { return a.rel - b.rel; });
  }
  function freeJamKeysForDegree(deg) {
    var d = String(deg);
    var out = { high: "", mid: "", low: "" };
    Object.keys(FREE_JAM_KEYS).forEach(function (k) {
      var spec = FREE_JAM_KEYS[k];
      if (spec.deg === d) out[spec.row] = k;
    });
    return out;
  }
  function freeJamKeysForPc(tonicName, scaleId, pc) {
    var notes = scaleNotesAscending(tonicName, scaleId);
    var idx = -1, i;
    for (i = 0; i < notes.length; i++) if (notes[i].pc === ((pc % 12) + 12) % 12) idx = i;
    if (idx < 0) return { high: "", mid: "", low: "" };
    return {
      high: FREE_JAM_KEY_ROWS.high[idx] || "",
      mid: FREE_JAM_KEY_ROWS.mid[idx] || "",
      low: FREE_JAM_KEY_ROWS.low[idx] || ""
    };
  }
  function freeJamPitchForKey(tonicName, scaleId, key) {
    var spec = freeJamKeySpec(key);
    if (!spec) return null;
    var notes = scaleNotesAscending(tonicName, scaleId);
    var idx = parseInt(spec.deg, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= notes.length) return null;
    var hit = notes[idx];
    return {
      pc: hit.pc,
      label: hit.info.label,
      degree: hit.info.degree,
      name: hit.info.name,
      oct: spec.oct,
      key: String(key).toUpperCase(),
      row: spec.row,
      index: idx
    };
  }
  function freeJamMidi(pc, tonicPc, octave, octShift, instOctShift) {
    var midi = 12 * ((octave == null ? 4 : octave) + 1) + (pc % 12) + 12 * (instOctShift || 0);
    if ((pc % 12) < (tonicPc % 12)) midi += 12;
    midi += (octShift || 0) * 12;
    return midi;
  }
  function isJamScalePc(tonicName, scaleId, pc) {
    var sp = spellJamScale(tonicName, scaleId);
    return !!(sp && sp.byPc[(pc % 12 + 12) % 12]);
  }
  var JIANPU_DURS = [
    { id: "whole", name: "全", beats: 4, units: 32, underlines: 0 },
    { id: "half", name: "二分", beats: 2, units: 16, underlines: 0 },
    { id: "quarter", name: "四分", beats: 1, units: 8, underlines: 0 },
    { id: "eighth", name: "八分", beats: 0.5, units: 4, underlines: 1 },
    { id: "sixteenth", name: "十六分", beats: 0.25, units: 2, underlines: 2 }
  ];
  function jianpuDurById(id) {
    for (var i = 0; i < JIANPU_DURS.length; i++) if (JIANPU_DURS[i].id === id) return JIANPU_DURS[i];
    return JIANPU_DURS[2];
  }
  function jianpuUnits(dur, dotted, kind) {
    var u;
    if (kind === "tie") {
      u = jianpuDurById(dur || "quarter").units;
      return dotted ? Math.round(u * 1.5) : u;
    }
    u = jianpuDurById(dur || "quarter").units;
    return dotted ? Math.round(u * 1.5) : u;
  }
  function jianpuBeats(dur, dotted, kind) {
    return jianpuUnits(dur, dotted, kind) / 8;
  }
  function parseJianpuLabel(degreeLabel) {
    var raw = String(degreeLabel == null ? "1" : degreeLabel);
    var acc = "";
    if (raw.charAt(0) === "#" || raw.charAt(0) === "b") {
      acc = raw.charAt(0);
      raw = raw.slice(1);
    }
    return { acc: acc, degree: raw, text: acc + raw };
  }
  function jianpuToken(degreeLabel, oct, opts) {
    opts = opts || {};
    var kind = opts.kind || "note";
    var dur = opts.dur || "quarter";
    var dotted = !!opts.dotted;
    var parsed = parseJianpuLabel(degreeLabel);
    if (kind === "rest") { parsed = { acc: "", degree: "0", text: "0" }; oct = 0; }
    if (kind === "tie") { parsed = { acc: "", degree: "-", text: "-" }; oct = 0; }
    return {
      kind: kind,
      text: parsed.text,
      acc: parsed.acc,
      degree: parsed.degree,
      oct: oct || 0,
      dur: dur,
      dotted: dotted,
      beats: jianpuBeats(dur, dotted, kind),
      units: jianpuUnits(dur, dotted, kind),
      pc: opts.pc != null ? opts.pc : null
    };
  }
  function jianpuToString(tokens) {
    return (tokens || []).map(function (t) {
      var s = t.text;
      if (t.oct > 0) s += "˙";
      if (t.oct < 0) s += ".";
      return s;
    }).join(" ");
  }
  function addJianpuNote(tokens, label, oct, dur, dotted, pc) {
    return (tokens || []).concat([jianpuToken(label, oct, { kind: "note", dur: dur, dotted: dotted, pc: pc })]);
  }
  function addJianpuRest(tokens, dur, dotted) {
    return (tokens || []).concat([jianpuToken("0", 0, { kind: "rest", dur: dur, dotted: dotted })]);
  }
  function addJianpuTie(tokens, dur, dotted) {
    return (tokens || []).concat([jianpuToken("-", 0, { kind: "tie", dur: dur || "quarter", dotted: !!dotted })]);
  }
  function backspaceJianpu(tokens) {
    return (tokens || []).slice(0, Math.max(0, (tokens || []).length - 1));
  }
  function clearJianpuTokens() { return []; }
  function relativeMajorName(tonicName, quality) {
    if (quality !== "minor") return tonicName;
    var ch = diatonicChords(tonicName, "minor")[2];
    return ch && ch.name ? ch.name : tonicName;
  }
  function jianpuKeyMark(tonicName, quality) {
    return "1=" + relativeMajorName(tonicName, quality);
  }
  function jianpuMeterBeats(rhythmId) {
    return freeJamRhythmById(rhythmId).meter;
  }
  function jianpuUnderlines(tok) {
    if (!tok || tok.kind === "tie") return 0;
    return jianpuDurById(tok.dur).underlines;
  }
  function expandJianpuGlyphs(tok) {
    var beats = tok.beats;
    var ul = jianpuUnderlines(tok);
    var head = {
      type: tok.kind === "tie" ? "dash" : (tok.kind === "rest" ? "rest" : "head"),
      text: tok.kind === "tie" ? "-" : (tok.kind === "rest" ? "0" : tok.degree),
      acc: tok.kind === "note" ? (tok.acc || "") : "",
      oct: tok.kind === "note" ? (tok.oct || 0) : 0,
      underlines: ul,
      dotted: false,
      tied: false,
      beats: beats,
      units: tok.units,
      src: tok
    };
    if (beats < 1) {
      head.dotted = !!tok.dotted || Math.abs(beats - 0.75) < 1e-6 || Math.abs(beats - 0.375) < 1e-6;
      return [head];
    }
    var intBeats = Math.floor(beats + 1e-9);
    var frac = beats - intBeats;
    if (intBeats === 1 && frac >= 0.49) {
      head.dotted = true;
      head.beats = beats;
      head.units = tok.units;
      return [head];
    }
    head.beats = 1;
    head.units = 8;
    head.dotted = false;
    var glyphs = [head];
    var remain = intBeats - 1;
    var i;
    for (i = 0; i < remain; i++) {
      glyphs.push({
        type: "dash", text: "-", acc: "", oct: 0, underlines: 0,
        dotted: false, tied: false, beats: 1, units: 8, src: tok
      });
    }
    if (frac >= 0.49 && glyphs.length > 1) {
      glyphs[glyphs.length - 1].dotted = true;
    }
    return glyphs;
  }

  function jianpuChordsInMeasure(slots, measureIndex, meter, measureStartBeat) {
    var out = [], total, cycleStart, t, i, guard, slot, c0, c1, local;
    if (!slots || !slots.length) return out;
    total = freeJamTotalBeats(slots);
    if (total <= 0) return out;
    var start = measureStartBeat;
    var end = measureStartBeat + meter;
    cycleStart = Math.floor((start + 1e-9) / total) * total;
    t = cycleStart;
    i = 0;
    guard = 0;
    while (t < end - 1e-9 && guard++ < 1000) {
      slot = slots[i];
      c0 = t;
      c1 = t + slot.beats;
      if (c1 > start + 1e-9 && c0 < end - 1e-9) {
        local = Math.max(0, c0 - start);
        if (c0 >= start - 1e-9 || local === 0) {
          out.push({ beat: local, label: slot.shouLabel, name: slot.name, slot: slot });
        }
      }
      t = c1;
      i = (i + 1) % slots.length;
    }
    return out;
  }

  function jianpuLayout(tokens, opts) {
    opts = opts || {};
    var meter = opts.meter || jianpuMeterBeats(opts.rhythmId);
    var meterUnits = meter * 8;
    var list = tokens || [];
    var measures = [];
    var curItems = [];
    var used = 0;
    var measureStartBeat = 0;

    function finishMeasure(partial) {
      if (!curItems.length && !partial) {
        used = 0;
        return;
      }
      var m = {
        items: curItems,
        units: used,
        beats: used / 8,
        meter: meter,
        startBeat: measureStartBeat,
        chords: []
      };
      measures.push(m);
      measureStartBeat += meter;
      curItems = [];
      used = 0;
    }

    function pushItem(item, units) {
      var room = meterUnits - used;
      if (units <= room + 0) {
        item.startUnits = used;
        item.startBeat = used / 8;
        item.units = units;
        item.beats = units / 8;
        curItems.push(item);
        used += units;
        if (used >= meterUnits) finishMeasure(false);
        return;
      }
      if (room > 0) {
        var first = {};
        var k;
        for (k in item) if (Object.prototype.hasOwnProperty.call(item, k)) first[k] = item[k];
        first.tied = true;
        first.split = true;
        pushItem(first, room);
        var rest = {};
        for (k in item) if (Object.prototype.hasOwnProperty.call(item, k)) rest[k] = item[k];
        rest.tieStart = true;
        rest.split = true;
        pushItem(rest, units - room);
        return;
      }
      finishMeasure(false);
      pushItem(item, units);
    }

    list.forEach(function (tok) {
      var glyphs = expandJianpuGlyphs(tok);
      glyphs.forEach(function (g) {
        var u = g.units || Math.round((g.beats || 0) * 8);
        if (u <= 0) u = tok.units;
        pushItem(g, u);
      });
    });
    if (curItems.length) finishMeasure(true);

    measures.forEach(function (m, mi) {
      var i, g, beat, group = null;
      for (i = 0; i < m.items.length; i++) {
        g = m.items[i];
        beat = Math.floor(g.startBeat + 1e-9);
        if (g.underlines > 0 && g.type !== "dash") {
          if (group && group.beat === beat) {
            group.indices.push(i);
            if (g.underlines > group.underlines) group.underlines = g.underlines;
          } else {
            group = { beat: beat, indices: [i], underlines: g.underlines };
            if (!m.beams) m.beams = [];
            m.beams.push(group);
          }
        } else {
          group = null;
        }
      }
      if (opts.showChords) {
        m.chords = jianpuChordsInMeasure(opts.slots || [], mi, meter, m.startBeat);
      }
    });

    return {
      title: opts.title || "",
      keyMark: jianpuKeyMark(opts.tonic || "C", opts.quality || "major"),
      meter: meter,
      meterLabel: meter + "/4",
      bpm: opts.bpm || 96,
      tonic: opts.tonic || "C",
      quality: opts.quality || "major",
      measures: measures
    };
  }
  function jianpuLayoutToString(layout) {
    return (layout.measures || []).map(function (m) {
      var body = m.items.map(function (g) {
        var s = (g.acc || "") + (g.text || "");
        if (g.oct > 0) s += "˙";
        if (g.oct < 0) s += ".";
        if (g.dotted) s += ".";
        if (g.tied) s += "~";
        return s;
      }).join(" ");
      return body + " |";
    }).join(" ");
  }
  function jianpuPlaybackEvents(tokens, ctx) {
    ctx = ctx || {};
    var events = [], t = 0, i, tok, midi, instShift;
    instShift = ctx.instOctShift || 0;
    for (i = 0; i < (tokens || []).length; i++) {
      tok = tokens[i];
      if (tok.kind === "rest") { t += tok.beats; continue; }
      if (tok.kind === "tie") {
        if (events.length) events[events.length - 1].beats += tok.beats;
        t += tok.beats;
        continue;
      }
      midi = null;
      if (tok.pc != null && ctx.tonicPc != null) {
        midi = freeJamMidi(tok.pc, ctx.tonicPc, ctx.octave, tok.oct, instShift);
      }
      events.push({
        startBeat: t,
        beats: tok.beats,
        midi: midi,
        pc: tok.pc,
        oct: tok.oct,
        label: tok.text
      });
      t += tok.beats;
    }
    return { events: events, totalBeats: t };
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
    melodyHasKeyClues: melodyHasKeyClues, pickMelodyEnding: pickMelodyEnding,
    melodyMeterInfo: melodyMeterInfo, makeMelodyRhythm: makeMelodyRhythm,
    makeMelodyDegrees: makeMelodyDegrees, makePracticeMelody: makePracticeMelody,
    MELODY_END_WEIGHTS: MELODY_END_WEIGHTS,
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
    jamLegendText: jamLegendText,
    FREE_JAM_MAX: FREE_JAM_MAX, FREE_JAM_RHYTHMS: FREE_JAM_RHYTHMS, FREE_JAM_KEYS: FREE_JAM_KEYS, FREE_JAM_KEY_ROWS: FREE_JAM_KEY_ROWS,
    freeJamRhythmById: freeJamRhythmById, freeJamBeatOptions: freeJamBeatOptions, defaultFreeJamBeats: defaultFreeJamBeats,
    clampFreeJamBeats: clampFreeJamBeats, cycleFreeJamBeats: cycleFreeJamBeats, tonicInQuality: tonicInQuality,
    freeJamSlotLabel: freeJamSlotLabel, makeFreeJamSlot: makeFreeJamSlot, addFreeJamSlot: addFreeJamSlot,
    removeFreeJamSlot: removeFreeJamSlot, setFreeJamSlotBeats: setFreeJamSlotBeats, retargetFreeJamSlots: retargetFreeJamSlots,
    freeJamTotalBeats: freeJamTotalBeats, freeJamTotalSteps: freeJamTotalSteps, freeJamChordAtStep: freeJamChordAtStep,
    freeJamStepDurationBeats: freeJamStepDurationBeats, freeJamElapsedBeats: freeJamElapsedBeats,
    freeJamBarStep: freeJamBarStep, freeJamDrumHits: freeJamDrumHits,
    degFamily: degFamily, scaleNotesAscending: scaleNotesAscending, freeJamKeySpec: freeJamKeySpec, freeJamKeysForDegree: freeJamKeysForDegree, freeJamKeysForPc: freeJamKeysForPc, freeJamPitchForKey: freeJamPitchForKey,
    freeJamMidi: freeJamMidi, isJamScalePc: isJamScalePc, JIANPU_DURS: JIANPU_DURS, jianpuDurById: jianpuDurById,
    jianpuUnits: jianpuUnits, jianpuBeats: jianpuBeats, parseJianpuLabel: parseJianpuLabel,
    jianpuToken: jianpuToken, jianpuToString: jianpuToString,
    addJianpuNote: addJianpuNote, addJianpuRest: addJianpuRest, addJianpuTie: addJianpuTie,
    backspaceJianpu: backspaceJianpu, clearJianpuTokens: clearJianpuTokens,
    relativeMajorName: relativeMajorName, jianpuKeyMark: jianpuKeyMark, jianpuMeterBeats: jianpuMeterBeats,
    jianpuUnderlines: jianpuUnderlines, expandJianpuGlyphs: expandJianpuGlyphs,
    jianpuChordsInMeasure: jianpuChordsInMeasure, jianpuLayout: jianpuLayout,
    jianpuLayoutToString: jianpuLayoutToString, jianpuPlaybackEvents: jianpuPlaybackEvents
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__notePracticeTheory = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
