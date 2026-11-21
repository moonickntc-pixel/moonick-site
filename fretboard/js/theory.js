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
        text: a.name + "→" + b.name + " " + iname + "（" + semi + " 格）"
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

  function intendedForExtra(spelled, board, string, fret, name) {
    var tun = TUNINGS[board];
    var pc = (tun.openMidi[string] + fret) % 12;
    if (spelled.byPc[pc]) {
      return { rec: spelled.byPc[pc], inScale: true, dist: 0, sameLetter: true };
    }
    var clickedLetter = name && name[0] && LETTERS.indexOf(name[0]) >= 0 ? name[0] : null;
    var best = null;
    spelled.notes.forEach(function (rec) {
      var d = Math.min((rec.pc - pc + 12) % 12, (pc - rec.pc + 12) % 12);
      var sameLetter = clickedLetter && rec.name[0] === clickedLetter;
      var score = d * 10 - (sameLetter ? 3 : 0);
      if (!best || score < best.score) best = { rec: rec, dist: d, sameLetter: !!sameLetter, score: score };
    });
    return best ? { rec: best.rec, inScale: false, dist: best.dist, sameLetter: best.sameLetter } : null;
  }

  function explainExtra(item, question, spelled, sc) {
    var board = question.board;
    var tun = TUNINGS[board];
    var pc = (tun.openMidi[item.string] + item.fret) % 12;
    var shown = item.name || (spelled.byPc[pc] ? spelled.byPc[pc].name : "");
    var where = cellPhrase(board, item.string, item.fret);
    var intend = intendedForExtra(spelled, board, item.string, item.fret, shown);
    var text;
    if (intend && intend.inScale) {
      text = "你點了 " + (shown || intend.rec.name) + "（" + where + "）。" +
        (shown && shown !== intend.rec.name ? "這個格子的音是 " + intend.rec.name + "，" : "") +
        intend.rec.name + " 是" + sc.name + degreePhrase(intend.rec.degree) + "，但它不在這個指型的把位裡。這個指型在第 " +
        question.anchors[0] + " 到 " + (Math.max.apply(null, question.anchors.length ? question.anchors.map(function (a) { return a; }) : [0]) ) + " 格附近。";
      // refine box range using used anchor if present later
    } else if (intend) {
      var delta = signedSemi(pc, intend.rec.pc);
      var raise = delta > 0 && intend.sameLetter;
      var lower = delta < 0 && intend.sameLetter;
      text = "你點了 " + (shown || "這個音") + "（" + where + "），這個音不在" + sc.name + "音階裡。";
      if (intend.sameLetter && Math.abs(delta) === 1) {
        text += sc.name + degreePhrase(intend.rec.degree) + "要" + (raise ? "升高" : "降低") + "半音變成 " + intend.rec.name + "，" + directionPhrase(delta) + "就是。";
      } else {
        text += "離它最近的音階音是 " + intend.rec.name + "（" + degreePhrase(intend.rec.degree) + "），差 " + intend.dist + " 格，" + directionPhrase(delta) + "就是。";
      }
    } else {
      text = "你點了 " + (shown || "這個音") + "（" + where + "），這個音不在" + sc.name + "音階裡。";
    }
    return {
      kind: "extra", string: item.string, fret: item.fret, name: shown,
      key: item.string + "-" + item.fret,
      title: "多點了：" + (shown || "") + "（" + where + "）",
      text: text,
      relatedName: intend && intend.rec ? intend.rec.name : null,
      relatedIv: intend && intend.rec ? intend.rec.iv : null
    };
  }

  function explainMissing(item, question, spelled, sc) {
    var rec = spelled.byPc[parseTonic(item.name).pc] || spelled.notes.filter(function (n) { return n.name === item.name; })[0];
    var prev = rec ? previousScaleNote(spelled, rec) : null;
    var where = cellPhrase(question.board, item.string, item.fret);
    var text = "漏了" + (rec ? degreePhrase(rec.degree) + " " : "") + item.name + "（" + where + "）。";
    if (prev) {
      text += "從前面的 " + prev.rec.name + "（" + degreePhrase(prev.rec.degree) + "）往上算" + prev.intervalName + "，要走 " + prev.frets + " 格。";
    }
    return {
      kind: "missing", string: item.string, fret: item.fret, name: item.name,
      key: item.string + "-" + item.fret,
      title: "漏點了：" + item.name + "（" + where + "）",
      text: text,
      relatedName: item.name,
      relatedIv: rec ? rec.iv : null
    };
  }

  function explainWrongName(item, question, spelled, sc) {
    var rec = spelled.notes.filter(function (n) { return n.name === item.expected; })[0] || spelled.byPc[parseTonic(item.expected).pc];
    var prev = rec ? previousScaleNote(spelled, rec) : null;
    var where = cellPhrase(question.board, item.string, item.fret);
    var gotPc = parseTonic(item.name).pc;
    var expPc = parseTonic(item.expected).pc;
    var text;
    if (gotPc === expPc) {
      text = "這個位置是 " + item.expected + "，不是 " + item.name + "。";
      if (sc.iv.length >= 7 && prev) {
        text += sc.name + "每個音用一個英文字母、一個字母只用一次；前一個音是 " + prev.rec.name + "，所以這裡要接 " + item.expected[0] + "，寫成 " + item.expected + "。";
      } else if (prev) {
        text += "前一個音是 " + prev.rec.name + "，這裡要寫成 " + item.expected + "。";
      }
    } else {
      text = "這個格子的音是 " + item.expected + "（" + (rec ? degreePhrase(rec.degree) : "") + "），不是 " + item.name + "。";
      if (prev) {
        text += sc.name + degreePhrase(rec.degree) + "要從前面的 " + prev.rec.name + " 走" + prev.intervalName + "（" + prev.frets + " 格）到 " + item.expected + "。";
      }
    }
    return {
      kind: "wrongName", string: item.string, fret: item.fret, name: item.name, expected: item.expected,
      key: item.string + "-" + item.fret,
      title: "音名錯了：" + item.name + "→" + item.expected + "（" + where + "）",
      text: text,
      relatedName: item.expected,
      relatedIv: rec ? rec.iv : null
    };
  }

  function boxRangeText(question, usedAnchor) {
    var a = usedAnchor != null ? usedAnchor : question.statedAnchor;
    return "第 " + a + " 到 " + (a + BOX_SPAN) + " 格";
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
      // fix box range wording for in-scale extras
      if (e.text.indexOf("這個指型在第 ") >= 0) {
        e.text = e.text.replace(/這個指型在第 .*$/, "這個指型在" + boxRangeText(question, grade.usedAnchor) + "。");
      }
      errors.push(e);
    });
    (grade.missing || []).forEach(function (x) {
      var e = explainMissing(x, question, spelled, sc);
      if (e.relatedName) related[e.relatedName] = true;
      errors.push(e);
    });
    (grade.wrongName || []).forEach(function (x) {
      var e = explainWrongName(x, question, spelled, sc);
      if (e.relatedName) related[e.relatedName] = true;
      errors.push(e);
    });
    var walk = scaleWalk(question.tonic, question.scale).map(function (step) {
      var copy = {};
      Object.keys(step).forEach(function (k) { copy[k] = step[k]; });
      copy.highlight = !!related[step.to];
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
    answerSet: answerSet, scaleFormula: scaleFormula, scaleWalk: scaleWalk,
    explainGrade: explainGrade, intervalName: intervalName, fretTip: fretTip
  };
  root.__fretTheory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
