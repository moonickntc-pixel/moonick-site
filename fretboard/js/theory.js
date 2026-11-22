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

  // 指型名稱：6 弦（Bass 4 弦）上該把位最低音，在唱名框架裡的唱名。
  // 主音唱名固定：小調系（自然／和聲／旋律小調、小調五聲、藍調、Dorian、Phrygian，Locrian 暫同）主音當 la；
  // 大調系（大調、大調五聲、Lydian、Mixolydian）主音當 do。變化音照實際音
  //（例如 A Dorian 是 6 7 1 2 3 #4 5，唱名框架的 do 是 C，但 F 變成 F#）。
  // 五個指型由低到高：Mi、Sol、La、Do、Re。介面只用唱名，不寫編號。
  var PATTERNS = [
    { id: 1, solfa: "mi", parentDeg: 2, label: "Mi 指型" },
    { id: 2, solfa: "sol", parentDeg: 4, label: "Sol 指型" },
    { id: 3, solfa: "la", parentDeg: 5, label: "La 指型" },
    { id: 4, solfa: "do", parentDeg: 0, label: "Do 指型" },
    { id: 5, solfa: "re", parentDeg: 1, label: "Re 指型" }
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
    { id: "dorian", name: "Dorian（多利亞）", quality: "modal", iv: [0, 2, 3, 5, 7, 9, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 3, parentSt: 2 },
    { id: "phrygian", name: "Phrygian（弗里吉亞）", quality: "modal", iv: [0, 1, 3, 5, 7, 8, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 3, parentSt: 2 },
    { id: "lydian", name: "Lydian（利底亞）", quality: "modal", iv: [0, 2, 4, 6, 7, 9, 11], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 0, parentSt: 0 },
    { id: "mixolydian", name: "Mixolydian（混合利底亞）", quality: "modal", iv: [0, 2, 4, 5, 7, 9, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 0, parentSt: 0 },
    { id: "locrian", name: "Locrian（洛克里亞）", quality: "modal", iv: [0, 1, 3, 5, 6, 8, 10], st: [0, 1, 2, 3, 4, 5, 6], parentIv: 3, parentSt: 2 }
  ];

  var TUNINGS = {
    guitar: { id: "guitar", name: "吉他", stringCount: 6, openMidi: [40, 45, 50, 55, 59, 64], openName: ["E", "A", "D", "G", "B", "E"], frets: 16 },
    bass: { id: "bass", name: "Bass", stringCount: 4, openMidi: [28, 33, 38, 43], openName: ["E", "A", "D", "G"], frets: 16 }
  };
  var BOX_SPAN = 4; // 預設窗寬 5 格（含兩端）。各指型相對錨點的偏移見 boxOffset。

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

  function solfaDisplay(solfa) {
    if (!solfa) return "";
    if (solfa.charAt(0) === "#" || solfa.charAt(0) === "b") {
      return solfa.charAt(0) + solfa.charAt(1).toUpperCase() + solfa.slice(2);
    }
    return solfa.charAt(0).toUpperCase() + solfa.slice(1);
  }

  var DEGREE_SOLFA = {
    "1": "do", "b2": "bre", "2": "re", "b3": "bmi", "3": "mi",
    "4": "fa", "#4": "#fa", "b5": "bsol", "5": "sol", "#5": "#sol",
    "b6": "bla", "6": "la", "b7": "bti", "7": "ti"
  };
  function solfaOfDegree(deg) { return DEGREE_SOLFA[deg] || ""; }
  function solfaFamily(solfaOrDeg) {
    var s = DEGREE_SOLFA[solfaOrDeg] || solfaOrDeg || "";
    return s.replace(/^[#b]+/, "");
  }
  function isDegreeToken(s) { return /^(#|b)?[1-7]$/.test(String(s || "")); }
  function baseDegreeNum(deg) { return String(deg || "").replace(/^[#b]+/, ""); }

  var QUIZ_DEGREES = ["1", "b2", "2", "b3", "3", "4", "#4", "b5", "5", "#5", "b6", "6", "b7", "7"];
  function quizDegreeChoices(tonicName, scaleId, preferred) {
    var spelled = spellScale(tonicName, scaleId);
    var names = [], seen = {};
    function add(n) { if (n && !seen[n]) { seen[n] = 1; names.push(n); } }
    if (preferred) add(preferred);
    spelled.notes.forEach(function (n) { add(n.degree); });
    QUIZ_DEGREES.forEach(add);
    return names;
  }

  // 小調系主音當 la（唱名框架的 do 在主音上方小三度）；大調系主音當 do。
  function isMinorSystem(scaleId) {
    var sc = scaleById(scaleId);
    return !!(sc && sc.parentIv === 3);
  }

  function allPatternAnchors(tonicName, scaleId, maxFret) {
    if (maxFret == null) maxFret = 16;
    var set = [];
    PATTERNS.forEach(function (p) {
      anchorFrets(tonicName, scaleId, p.id, maxFret).anchors.forEach(function (a) {
        if (set.indexOf(a) < 0) set.push(a);
      });
    });
    set.sort(function (a, b) { return a - b; });
    return set;
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

  // 級數是首調唱名的數字，基準是唱名框架的 do：小調系主音當 6（La），大調系主音當 1（Do）。
  // ivFromDo 是該音相對 do 的半音數。變化音照實際音高與拼寫：第 4 音字母且增四度為 #4，第 5 音字母且減五度為 b5；
  // 第 5 音字母且增五度為 #5，第 6 音字母且小六度為 b6（例如和聲／旋律小調的導音是 #5）。
  function degreeLabel(ivFromDo, name, doLetter) {
    var table = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 7: "5", 9: "6", 10: "b7", 11: "7" };
    var li = LETTERS.indexOf(doLetter || (name && name[0]));
    var dist = name && name[0] && li >= 0 ? (LETTERS.indexOf(name[0]) - li + 7) % 7 : -1;
    if (ivFromDo === 6) {
      return dist === 3 ? "#4" : "b5";
    }
    if (ivFromDo === 8) {
      return dist === 4 ? "#5" : "b6";
    }
    return table[ivFromDo] || String(ivFromDo);
  }

  function spellScale(tonicName, scaleId) {
    var sc = scaleById(scaleId);
    var t = parseTonic(tonicName);
    var li = LETTERS.indexOf(t.letter);
    var par = parentDo(tonicName, scaleId);
    var byPc = {};
    var notes = [];
    for (var i = 0; i < sc.iv.length; i++) {
      var L = LETTERS[(li + sc.st[i] + 7) % 7];
      var pc = (t.pc + sc.iv[i]) % 12;
      var name = spellLetter(L, pc);
      var ivFromDo = (sc.iv[i] - sc.parentIv % 12 + 12) % 12;
      var deg = degreeLabel(ivFromDo, name, par.name[0]);
      var rec = { pc: pc, name: name, degree: deg, iv: sc.iv[i], step: i };
      notes.push(rec);
      byPc[pc] = rec;
    }
    return { tonic: t, scale: sc, notes: notes, byPc: byPc, parent: par };
  }

  // 指型位置看這個音階裡，該唱名（Mi／Sol／La／Do／Re）的實際音高。
  // 若該音被升降（例如和聲小調 Sol 變成 #Sol），把位跟著實際音走，不留在未變化的位置。
  // 若未變化的音仍在音階裡（例如藍調同時有 b3 與 3），仍用未變化的那一個當這個指型的名字音。
  function namesakeInScale(tonicName, scaleId, patternId) {
    var spelled = spellScale(tonicName, scaleId);
    var pat = patternById(patternId);
    var idealPc = (spelled.parent.pc + MAJOR[pat.parentDeg]) % 12;
    if (spelled.byPc[idealPc]) return spelled.byPc[idealPc];
    var p = parseTonic(spelled.parent.name);
    var letter = LETTERS[(LETTERS.indexOf(p.letter) + pat.parentDeg) % 7];
    var cands = spelled.notes.filter(function (n) { return n.name[0] === letter; });
    if (!cands.length) return { pc: idealPc, name: spellLetter(letter, idealPc), degree: pat.solfa === "do" ? "1" : "", iv: -1 };
    cands.sort(function (a, b) {
      var da = Math.min((a.pc - idealPc + 12) % 12, (idealPc - a.pc + 12) % 12);
      var db = Math.min((b.pc - idealPc + 12) % 12, (idealPc - b.pc + 12) % 12);
      return da - db;
    });
    return cands[0];
  }

  function anchorFrets(tonicName, scaleId, patternId, maxFret) {
    if (maxFret == null) maxFret = 16;
    var spelled = spellScale(tonicName, scaleId);
    var pat = patternById(patternId);
    var rec = namesakeInScale(tonicName, scaleId, patternId);
    var namesakePc = rec.pc;
    var openPc = 4; // 最低弦都是 E
    var a = (namesakePc - openPc + 12) % 12;
    var out = [];
    if (boxFits(pat.id, a, maxFret)) out.push(a);
    if (boxFits(pat.id, a + 12, maxFret)) out.push(a + 12);
    var lowSolfa = solfaOfDegree(rec.degree) || pat.solfa;
    return {
      namesakePc: namesakePc,
      namesakeDegree: rec.degree,
      namesakeName: rec.name,
      anchors: out,
      solfa: pat.solfa,
      solfaLabel: solfaDisplay(pat.solfa),
      lowSolfa: lowSolfa,
      lowSolfaLabel: solfaDisplay(lowSolfa),
      altered: solfaFamily(lowSolfa) === pat.solfa && lowSolfa !== pat.solfa,
      pattern: pat.id,
      parent: spelled.parent
    };
  }

  // 把位窗相對錨點（最低弦上的名字音）的偏移。
  // Mi／Do／Re 暫為 [0, 4]；Sol 為 [-1, 3]；La 為 [-1, 2]（例如 C 大調錨點第 5 格，窗是第 4–7 格，共 4 格）。
  // 若 anchor+lo < 0：夾到空弦（不把整個窗移高八度），開放把位仍保留。超過指板上限的把位不採用。
  function boxOffset(patternId) {
    var id = Number(patternId);
    if (id === 2) return { lo: -1, hi: 3 };
    if (id === 3) return { lo: -1, hi: 2 };
    return { lo: 0, hi: 4 };
  }

  function boxWindow(patternId, anchor, maxFret) {
    var off = boxOffset(patternId);
    var lo = anchor + off.lo;
    var hi = anchor + off.hi;
    var clampedLow = false;
    var clampedHigh = false;
    if (lo < 0) { lo = 0; clampedLow = true; }
    if (maxFret != null && hi > maxFret) { hi = maxFret; clampedHigh = true; }
    return { lo: lo, hi: hi, anchor: anchor, clampedLow: clampedLow, clampedHigh: clampedHigh };
  }

  function boxFits(patternId, anchor, maxFret) {
    if (anchor < 0) return false;
    var off = boxOffset(patternId);
    return anchor + off.hi <= maxFret;
  }

  function patternNotes(board, tonicName, scaleId, patternId, anchor) {
    var tun = TUNINGS[board];
    var spelled = spellScale(tonicName, scaleId);
    var box = boxWindow(patternId, anchor, tun.frets);
    var lo = box.lo, hi = box.hi;
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
    // 同一把位裡，完全相同的音高（同 MIDI）只留一顆。
    // 規則：若兩條相鄰弦出現同一個音，留較高音弦、較低品位的那顆，拿掉較低音弦較高品位的重複。
    // 這就是標準 CAGED 七聲音階指型（例如 C 大調 Mi 指型留 B 弦空弦 B，拿掉 G 弦第 4 格 B）。
    // 八度音（同音名不同 MIDI）都留。指型名字仍看最低弦最低音，不受這步影響。
    return dedupeUnisonPitches(notes);
  }

  function dedupeUnisonPitches(notes) {
    var best = {};
    var i, n, prev;
    for (i = 0; i < notes.length; i++) {
      n = notes[i];
      prev = best[n.midi];
      if (!prev || n.string > prev.string || (n.string === prev.string && n.fret < prev.fret)) {
        best[n.midi] = n;
      }
    }
    var out = [];
    for (i = 0; i < notes.length; i++) {
      n = notes[i];
      if (best[n.midi] === n) out.push(n);
    }
    return out;
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
    var sc = scaleById(q.scale);
    var head = keyTitle(q.tonic, q.scale) + " " + patternLabel(q.pattern);
    if (!(sc.quality === "major" && sc.id === "major")) head += " " + sc.name;
    return TUNINGS[q.board].name + "｜" + head + "｜請在" + posText + "把這個指型的音階音點出來，並選數字音名";
  }

  function answerSet(q, anchor) {
    return patternNotes(q.board, q.tonic, q.scale, q.pattern, anchor).map(function (n) {
      return { string: n.string, fret: n.fret, name: n.name, degree: n.degree, letter: n.name, key: n.string + "-" + n.fret };
    });
  }

  function clickLabel(c) {
    if (c && c.degree != null && c.degree !== "") return c.degree;
    return c && c.name != null ? c.name : "";
  }

  // clicks: [{string, fret, degree}] 或以 name 當數字音名
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
      var got = clickLabel(c);
      if (!exp) extra.push({ string: c.string, fret: c.fret, name: got, degree: got });
      else if (got === exp.degree) correct.push({ string: c.string, fret: c.fret, name: exp.degree, degree: exp.degree, letter: exp.letter || exp.name });
      else wrongName.push({ string: c.string, fret: c.fret, name: got, degree: got, expected: exp.degree, letter: exp.letter || exp.name });
    });
    var missing = expected.map(function (e) {
      return { string: e.string, fret: e.fret, name: e.degree, degree: e.degree, letter: e.letter || e.name, key: e.key };
    }).filter(function (e) { return !seen[e.key]; });
    var score = Math.max(0, correct.length - extra.length);
    var pct = expected.length ? Math.round(100 * score / expected.length) : 0;
    return {
      correct: correct, wrongName: wrongName, extra: extra, missing: missing,
      expectedCount: expected.length, score: score, percent: pct, perfect: missing.length === 0 && extra.length === 0 && wrongName.length === 0
    };
  }

  function letterSteps(fromName, toName) {
    return (LETTERS.indexOf(toName[0]) - LETTERS.indexOf(fromName[0]) + 7) % 7;
  }

  function intervalNameBySteps(semitones, steps) {
    var L = ((steps % 7) + 7) % 7;
    if (semitones === 1 && (L === 1 || L === 0)) return "半音";
    if (semitones === 2 && L === 1) return "全音";
    if (semitones === 3 && L === 1) return "增二度";
    if (semitones === 3 && L === 2) return "小三度";
    if (semitones === 4 && L === 2) return "大三度";
    if (semitones === 5 && L === 3) return "純四度";
    if (semitones === 6 && L === 3) return "增四度";
    if (semitones === 6 && L === 4) return "減五度";
    if (semitones === 4 && L === 1) return "倍增二度";
    if (semitones === 2 && L === 0) return "全音";
    return semitones + " 個半音";
  }

  function intervalName(semitones, fromName, toName) {
    return intervalNameBySteps(semitones, letterSteps(fromName, toName));
  }

  function upwardSemi(fromPc, toPc) {
    var d = (toPc - fromPc + 12) % 12;
    return d === 0 ? 12 : d;
  }

  function signedSemi(fromPc, toPc) {
    var up = (toPc - fromPc + 12) % 12;
    var down = (fromPc - toPc + 12) % 12;
    if (up === 0 && down === 0) return 0;
    return up <= down ? up : -down;
  }

  function scaleFormula(scaleId) {
    var sc = scaleById(scaleId);
    var steps = [];
    for (var i = 0; i < sc.iv.length; i++) {
      var j = (i + 1) % sc.iv.length;
      var semi = i === sc.iv.length - 1 ? (12 - sc.iv[i] + sc.iv[0]) : (sc.iv[j] - sc.iv[i]);
      if (semi < 0) semi += 12;
      if (semi === 0) semi = 12;
      var letters = i === sc.iv.length - 1 ? (7 - sc.st[i] + sc.st[0]) : (sc.st[j] - sc.st[i]);
      letters = ((letters % 7) + 7) % 7;
      var name = intervalNameBySteps(semi, letters);
      steps.push({ semitones: semi, letterSteps: letters, name: name, frets: semi });
    }
    return {
      steps: steps,
      text: steps.map(function (s) {
        return s.name === "全音" ? "全" : s.name === "半音" ? "半" : s.name;
      }).join(" ")
    };
  }

  function scaleWalk(tonicName, scaleId) {
    var notes = spellScale(tonicName, scaleId).notes;
    var walk = [];
    for (var i = 0; i < notes.length; i++) {
      var a = notes[i], b = notes[(i + 1) % notes.length];
      var semi = upwardSemi(a.pc, b.pc);
      var iname = intervalName(semi, a.name, b.name);
      walk.push({
        from: a.name, to: b.name,
        fromDegree: a.degree, toDegree: b.degree,
        fromIv: a.iv, toIv: b.iv,
        semitones: semi, intervalName: iname, frets: semi,
        text: a.degree + "→" + b.degree + " " + iname + "（" + semi + " 格，" + a.name + "→" + b.name + "）"
      });
    }
    return walk;
  }

  function degreePhrase(deg) {
    return "第 " + deg + " 級";
  }

  function stringLabel(board, string) {
    var tun = TUNINGS[board];
    return (tun.stringCount - string) + " 弦";
  }

  function cellPhrase(board, string, fret) {
    return stringLabel(board, string) + "第 " + fret + " 格";
  }

  function previousScaleNote(spelled, rec) {
    var notes = spelled.notes, i = -1, k;
    for (k = 0; k < notes.length; k++) if (notes[k].pc === rec.pc) i = k;
    if (i < 0) return null;
    var prev = notes[(i - 1 + notes.length) % notes.length];
    var semi = upwardSemi(prev.pc, rec.pc);
    return { rec: prev, semitones: semi, intervalName: intervalName(semi, prev.name, rec.name), frets: semi };
  }

  function fretTip(board) {
    if (board === "bass") {
      return "同一條弦上，1 格是半音、2 格是全音。Bass 相鄰兩條弦都差純四度（5 格）。";
    }
    return "同一條弦上，1 格是半音、2 格是全音。相鄰兩條弦大多差純四度（5 格）；只有 G 弦到 B 弦差大三度（4 格）。";
  }

  function directionPhrase(delta) {
    if (delta === 0) return "就在同一個格子";
    if (delta > 0) return "往右 " + delta + " 格";
    return "往左 " + (-delta) + " 格";
  }

  function spellPcNear(spelled, pc) {
    if (spelled.byPc[pc]) return spelled.byPc[pc].name;
    var major = spellScale(spelled.parent.name, "major");
    if (major.byPc[pc]) return major.byPc[pc].name;
    for (var i = 0; i < KEYS.length; i++) if (KEYS[i].pc === pc) return KEYS[i].name;
    return "";
  }

  function intendedForExtra(spelled, board, string, fret, name) {
    var tun = TUNINGS[board];
    var pc = (tun.openMidi[string] + fret) % 12;
    if (spelled.byPc[pc]) {
      return { rec: spelled.byPc[pc], inScale: true, dist: 0, sameFamily: true, pitchName: spelled.byPc[pc].name };
    }
    var clickedDeg = isDegreeToken(name) ? name : null;
    var clickedLetter = !clickedDeg && name && name[0] && LETTERS.indexOf(name[0]) >= 0 ? name[0] : null;
    var best = null;
    spelled.notes.forEach(function (rec) {
      var d = Math.min((rec.pc - pc + 12) % 12, (pc - rec.pc + 12) % 12);
      var sameFamily = clickedDeg ? baseDegreeNum(clickedDeg) === baseDegreeNum(rec.degree) : (clickedLetter && rec.name[0] === clickedLetter);
      var score = d * 10 - (sameFamily ? 3 : 0);
      if (!best || score < best.score) best = { rec: rec, dist: d, sameFamily: !!sameFamily, score: score };
    });
    return best ? { rec: best.rec, inScale: false, dist: best.dist, sameFamily: best.sameFamily, pitchName: spellPcNear(spelled, pc) } : null;
  }

  function formatDeg(rec) {
    if (!rec) return "";
    return rec.degree + "（" + rec.name + "）";
  }

  function explainExtra(item, question, spelled, sc) {
    var board = question.board;
    var tun = TUNINGS[board];
    var pc = (tun.openMidi[item.string] + item.fret) % 12;
    var shown = clickLabel(item);
    var pitchName = spellPcNear(spelled, pc);
    var where = cellPhrase(board, item.string, item.fret);
    var intend = intendedForExtra(spelled, board, item.string, item.fret, shown);
    var shownText = shown ? shown + (pitchName && !isDegreeToken(shown) ? "" : (pitchName ? "（" + pitchName + "）" : "")) : (pitchName || "這個音");
    var text;
    if (intend && intend.inScale) {
      text = "你點了 " + shownText + "（" + where + "）。" +
        formatDeg(intend.rec) + " 是" + sc.name + degreePhrase(intend.rec.degree) + "，但它不在這個指型的把位裡。這個指型在第 " +
        question.anchors[0] + " 到 " + (Math.max.apply(null, question.anchors.length ? question.anchors.map(function (a) { return a; }) : [0]) ) + " 格附近。";
    } else if (intend) {
      var delta = signedSemi(pc, intend.rec.pc);
      var raise = delta > 0 && intend.sameFamily;
      text = "你點了 " + shownText + "（" + where + "），這個音不在" + sc.name + "音階裡。";
      if (intend.sameFamily && Math.abs(delta) === 1) {
        text += sc.name + degreePhrase(intend.rec.degree) + "是 " + formatDeg(intend.rec) + "，" + directionPhrase(delta) + "就是。";
      } else {
        text += "離它最近的音階音是 " + formatDeg(intend.rec) + "，差 " + intend.dist + " 格，" + directionPhrase(delta) + "就是。";
      }
    } else {
      text = "你點了 " + shownText + "（" + where + "），這個音不在" + sc.name + "音階裡。";
    }
    return {
      kind: "extra", string: item.string, fret: item.fret, name: shown,
      key: item.string + "-" + item.fret,
      title: "多點了：" + (shown || pitchName || "") + "（" + where + "）",
      text: text,
      relatedName: intend && intend.rec ? intend.rec.name : null,
      relatedDegree: intend && intend.rec ? intend.rec.degree : null,
      relatedIv: intend && intend.rec ? intend.rec.iv : null
    };
  }

  function resolveScaleRec(item, spelled) {
    if (item.degree && spelled.notes.some(function (n) { return n.degree === item.degree; })) {
      return spelled.notes.filter(function (n) { return n.degree === item.degree; })[0];
    }
    if (item.letter && spelled.notes.some(function (n) { return n.name === item.letter; })) {
      return spelled.notes.filter(function (n) { return n.name === item.letter; })[0];
    }
    if (item.name && spelled.notes.some(function (n) { return n.name === item.name || n.degree === item.name; })) {
      return spelled.notes.filter(function (n) { return n.name === item.name || n.degree === item.name; })[0];
    }
    return null;
  }

  function explainMissing(item, question, spelled, sc) {
    var rec = resolveScaleRec(item, spelled);
    var prev = rec ? previousScaleNote(spelled, rec) : null;
    var where = cellPhrase(question.board, item.string, item.fret);
    var label = rec ? formatDeg(rec) : (item.degree || item.name || "");
    var text = "漏了" + (rec ? degreePhrase(rec.degree) + " " : "") + label + "（" + where + "）。";
    if (prev) {
      text += "從前面的 " + formatDeg(prev.rec) + "往上算" + prev.intervalName + "，要走 " + prev.frets + " 格。";
    }
    return {
      kind: "missing", string: item.string, fret: item.fret, name: rec ? rec.degree : (item.degree || item.name),
      key: item.string + "-" + item.fret,
      title: "漏點了：" + label + "（" + where + "）",
      text: text,
      relatedName: rec ? rec.name : item.name,
      relatedDegree: rec ? rec.degree : item.degree,
      relatedIv: rec ? rec.iv : null
    };
  }

  function explainWrongName(item, question, spelled, sc) {
    var rec = spelled.notes.filter(function (n) { return n.degree === item.expected; })[0] ||
      spelled.notes.filter(function (n) { return n.name === item.expected; })[0] ||
      resolveScaleRec({ name: item.letter, degree: item.expected, letter: item.letter }, spelled);
    var prev = rec ? previousScaleNote(spelled, rec) : null;
    var where = cellPhrase(question.board, item.string, item.fret);
    var got = clickLabel(item);
    var exp = rec ? rec.degree : item.expected;
    var text;
    var sameFamily = rec && isDegreeToken(got) && baseDegreeNum(got) === baseDegreeNum(rec.degree);
    text = "這個格子的音是 " + (rec ? formatDeg(rec) : exp) + "，不是 " + got + "。";
    if (sameFamily && rec) {
      text += sc.name + "這裡要寫成 " + rec.degree + "，不是 " + got + "。";
    } else if (prev && rec) {
      text += sc.name + degreePhrase(rec.degree) + "要從前面的 " + formatDeg(prev.rec) + " 走" + prev.intervalName + "（" + prev.frets + " 格）到 " + formatDeg(rec) + "。";
    }
    return {
      kind: "wrongName", string: item.string, fret: item.fret, name: got, expected: exp,
      key: item.string + "-" + item.fret,
      title: "音名錯了：" + got + "→" + exp + "（" + where + "）",
      text: text,
      relatedName: rec ? rec.name : item.expected,
      relatedDegree: rec ? rec.degree : exp,
      relatedIv: rec ? rec.iv : null
    };
  }

  function boxRangeText(question, usedAnchor) {
    var a = usedAnchor != null ? usedAnchor : question.statedAnchor;
    var maxFret = question.board && TUNINGS[question.board] ? TUNINGS[question.board].frets : 16;
    var box = boxWindow(question.pattern, a, maxFret);
    return "第 " + box.lo + " 到 " + box.hi + " 格";
  }

  function explainGrade(grade, question) {
    var sc = scaleById(question.scale);
    var spelled = spellScale(question.tonic, question.scale);
    var formula = scaleFormula(question.scale);
    var related = {};
    var errors = [];
    (grade.extra || []).forEach(function (x) {
      var e = explainExtra(x, question, spelled, sc);
      if (e.relatedName) related[e.relatedName] = true;
      if (e.relatedDegree) related[e.relatedDegree] = true;
      // fix box range wording for in-scale extras
      if (e.text.indexOf("這個指型在第 ") >= 0) {
        e.text = e.text.replace(/這個指型在第 .*$/, "這個指型在" + boxRangeText(question, grade.usedAnchor) + "。");
      }
      errors.push(e);
    });
    (grade.missing || []).forEach(function (x) {
      var e = explainMissing(x, question, spelled, sc);
      if (e.relatedName) related[e.relatedName] = true;
      if (e.relatedDegree) related[e.relatedDegree] = true;
      errors.push(e);
    });
    (grade.wrongName || []).forEach(function (x) {
      var e = explainWrongName(x, question, spelled, sc);
      if (e.relatedName) related[e.relatedName] = true;
      if (e.relatedDegree) related[e.relatedDegree] = true;
      errors.push(e);
    });
    var walk = scaleWalk(question.tonic, question.scale).map(function (step) {
      var copy = {};
      Object.keys(step).forEach(function (k) { copy[k] = step[k]; });
      copy.highlight = !!(related[step.to] || related[step.toDegree]);
      return copy;
    });
    return {
      formula: formula,
      walk: walk,
      errors: errors,
      tip: fretTip(question.board),
      hasErrors: errors.length > 0
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
    if (best) best.explain = explainGrade(best, question);
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
    var q = { board: board, tonic: tonic, scale: scale, pattern: pattern, anchors: an.anchors.slice(), statedAnchor: stated, solfa: an.solfa };
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
    solfaDisplay: solfaDisplay, solfaOfDegree: solfaOfDegree, solfaFamily: solfaFamily,
    isMinorSystem: isMinorSystem, allPatternAnchors: allPatternAnchors,
    namesakeInScale: namesakeInScale, quizDegreeChoices: quizDegreeChoices,
    boxOffset: boxOffset, boxWindow: boxWindow, boxFits: boxFits,
    anchorFrets: anchorFrets, patternNotes: patternNotes, dedupeUnisonPitches: dedupeUnisonPitches,
    keyTitle: keyTitle, patternLabel: patternLabel, questionPrompt: questionPrompt,
    makeQuestion: makeQuestion, gradeQuiz: gradeQuiz, randomQuestion: randomQuestion,
    answerSet: answerSet, scaleFormula: scaleFormula, scaleWalk: scaleWalk,
    explainGrade: explainGrade, intervalName: intervalName, fretTip: fretTip
  };
  root.__fretTheory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
