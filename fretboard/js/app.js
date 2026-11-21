/* 吉他／Bass 音階工具：指板瀏覽與小測驗 */
(function () {
  "use strict";
  var T = window.__fretTheory, A = window.__fretAudio;
  var state = {
    mode: "browse",
    board: "guitar",
    inst: "acoustic",
    key: 4, // E
    useEnh: false,
    scale: "harMinor",
    pattern: 3, // La
    showAll: false,
    label: "name",
    question: null,
    clicks: {},
    grade: null,
    autoInst: true,
    level: 1,
    score: 0,
    streak: 0,
    pendingLevelUp: false,
    shapeLock: "all"
  };
  var INLAYS = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1 };

  function tonicName() {
    return T.tonicNameOf(T.KEYS[state.key], state.useEnh);
  }
  function anchorsOf(patternId) {
    return T.anchorFrets(tonicName(), state.scale, patternId, T.TUNINGS[state.board].frets);
  }

  function currentNotes() {
    var tun = T.TUNINGS[state.board];
    if (state.showAll && state.mode === "browse") {
      var all = [], seen = {};
      T.PATTERNS.forEach(function (p) {
        var an = T.anchorFrets(tonicName(), state.scale, p.id, tun.frets);
        an.anchors.forEach(function (a) {
          T.patternNotes(state.board, tonicName(), state.scale, p.id, a).forEach(function (n) {
            var k = n.string + "-" + n.fret;
            if (!seen[k]) { seen[k] = 1; all.push(n); }
          });
        });
      });
      return all;
    }
    var an = T.anchorFrets(tonicName(), state.scale, state.pattern, tun.frets);
    if (state.mode === "quiz" && state.question) {
      return T.patternNotes(state.board, state.question.tonic, state.question.scale, state.question.pattern, state.question.statedAnchor);
    }
    // 瀏覽時若 0 與 12 都有，兩個把位都標出來，方便對照
    if (an.anchors.length > 1) {
      return an.anchors.reduce(function (acc, a) {
        return acc.concat(T.patternNotes(state.board, tonicName(), state.scale, state.pattern, a));
      }, []);
    }
    return T.patternNotes(state.board, tonicName(), state.scale, state.pattern, an.anchors[0]);
  }

  function scrollToFret(f) {
    var scroll = document.getElementById("fretScroll");
    var cell = document.querySelector('.cell[data-string="0"][data-fret="' + f + '"]');
    if (!cell || !scroll) return;
    if (scroll.scrollWidth <= scroll.clientWidth + 2) {
      scroll.scrollLeft = 0;
      return;
    }
    scroll.scrollLeft = Math.max(0, cell.offsetLeft - 80);
  }

  function closePop() {
    var p = document.getElementById("namePop");
    if (p) p.remove();
  }

  function nameChoices(pcPreferred) {
    var qTonic = state.question ? state.question.tonic : tonicName();
    var qScale = state.question ? state.question.scale : state.scale;
    var spelled = T.spellScale(qTonic, qScale);
    var preferred = pcPreferred != null && spelled.byPc[pcPreferred] ? spelled.byPc[pcPreferred].degree : null;
    return T.quizDegreeChoices(qTonic, qScale, preferred);
  }

  function openNamePop(cell, string, fret) {
    closePop();
    var tun = T.TUNINGS[state.board];
    var midi = tun.openMidi[string] + fret;
    var pop = document.createElement("div");
    pop.id = "namePop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "選數字音名");
    nameChoices(midi % 12).forEach(function (nm) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = nm;
      b.setAttribute("data-name", nm);
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var key = string + "-" + fret;
        state.clicks[key] = { string: string, fret: fret, name: nm, degree: nm };
        state.grade = null;
        closePop();
        A.playMidi(midi, state.inst);
        render();
      });
      pop.appendChild(b);
    });
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel";
    var key = string + "-" + fret;
    cancel.textContent = state.clicks[key] ? "取消這個音" : "關閉";
    cancel.addEventListener("click", function (e) {
      e.stopPropagation();
      if (state.clicks[key]) { delete state.clicks[key]; state.grade = null; }
      closePop();
      render();
    });
    pop.appendChild(cancel);
    document.body.appendChild(pop);
    var r = cell.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.left + r.width / 2 - pw / 2));
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function cellClick(string, fret, cell) {
    var tun = T.TUNINGS[state.board];
    var midi = tun.openMidi[string] + fret;
    if (state.mode === "browse") {
      A.playMidi(midi, state.inst);
      cell.classList.add("lit");
      setTimeout(function () { cell.classList.remove("lit"); }, 200);
      return;
    }
    if (state.grade) {
      A.playMidi(midi, state.inst);
      return;
    }
    var q = state.question;
    if (!q) return;
    if (q.kind === "identify") {
      var isTarget = q.targets.some(function (x) { return x.string === string && x.fret === fret; });
      if (!isTarget) return;
      openNamePop(cell, string, fret);
      return;
    }
    if (q.kind === "find") {
      var inBox = q.box && fret >= q.box.lo && fret <= q.box.hi;
      if (!inBox) return;
      var key = string + "-" + fret;
      if (state.clicks[key]) delete state.clicks[key];
      else state.clicks[key] = { string: string, fret: fret, degree: "" };
      A.playMidi(midi, state.inst);
      render();
    }
  }

  function cellDot(s, fr, tun, noteMap, gradeMap) {
    var key = s + "-" + fr;
    if (state.mode === "quiz" && state.grade && gradeMap[key]) {
      return { cls: gradeMap[key].kind, label: gradeMap[key].label };
    }
    if (state.mode === "quiz" && state.clicks[key]) {
      var q = state.question;
      if (q && q.kind === "find" && !state.grade) {
        return { cls: "pick", label: "" };
      }
      var qTonic = q ? q.tonic : tonicName();
      var qScale = q ? q.scale : state.scale;
      var rec = T.spellScale(qTonic, qScale).byPc[(tun.openMidi[s] + fr) % 12];
      var lab = state.clicks[key].degree || state.clicks[key].name || "";
      return { cls: rec && rec.iv === 0 ? "tonic" : "", label: lab };
    }
    if (state.mode === "browse" && noteMap[key]) {
      return {
        cls: noteMap[key].tonic ? "tonic" : "",
        label: state.label === "deg" ? noteMap[key].degree : noteMap[key].name
      };
    }
    return null;
  }

  function buildBoard() {
    var tun = T.TUNINGS[state.board];
    var box = document.getElementById("fretboard");
    box.innerHTML = "";
    closePop();

    var nums = document.createElement("div");
    nums.className = "fret-nums";
    nums.appendChild(document.createElement("span"));
    for (var f = 0; f <= tun.frets; f++) {
      var s = document.createElement("span");
      s.textContent = f === 0 ? "空弦" : String(f);
      nums.appendChild(s);
    }
    box.appendChild(nums);

    var notes = state.mode === "browse" ? currentNotes() : [];
    var noteMap = {};
    notes.forEach(function (n) { noteMap[n.string + "-" + n.fret] = n; });
    var gradeMap = {};
    if (state.mode === "quiz" && state.grade) {
      state.grade.correct.forEach(function (x) { gradeMap[x.string + "-" + x.fret] = { kind: "ok", label: x.name }; });
      state.grade.wrongName.forEach(function (x) { gradeMap[x.string + "-" + x.fret] = { kind: "warn", label: x.name + "→" + x.expected }; });
      state.grade.extra.forEach(function (x) { gradeMap[x.string + "-" + x.fret] = { kind: "bad", label: x.name }; });
      state.grade.missing.forEach(function (x) { gradeMap[x.string + "-" + x.fret] = { kind: "miss", label: x.name }; });
    }

    // 上面是最細的 1 弦（跟 TAB 譜一樣），最粗的弦在下面
    for (var sIdx = tun.stringCount - 1; sIdx >= 0; sIdx--) {
      var row = document.createElement("div");
      row.className = "string-row";
      var lab = document.createElement("div");
      lab.className = "string-lab";
      var nStr = tun.stringCount - sIdx;
      lab.textContent = nStr + "弦 " + tun.openName[sIdx];
      row.appendChild(lab);
      for (var fr = 0; fr <= tun.frets; fr++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.setAttribute("data-string", String(sIdx));
        btn.setAttribute("data-fret", String(fr));
        btn.setAttribute("aria-label", nStr + "弦第" + fr + "格");
        if (state.mode === "quiz" && state.question && state.question.box) {
          var qbox = state.question.box;
          if (fr >= qbox.lo && fr <= qbox.hi) btn.classList.add("in-box");
        }
        if (state.mode === "quiz" && state.question && (state.question.hint === "full" || state.question.hint === "soft") && state.question.boxNotes) {
          if (state.question.boxNotes.some(function (x) { return x.string === sIdx && x.fret === fr; })) {
            btn.classList.add("shape-outline");
            if (state.question.hint === "soft") btn.classList.add("shape-outline-soft");
          }
        }
        if (state.mode === "quiz" && state.question && state.question.kind === "identify" && state.question.targets) {
          if (state.question.targets.some(function (x) { return x.string === sIdx && x.fret === fr; })) btn.classList.add("circled");
        }
        if (state.mode === "quiz" && state.question && state.question.kind === "find" && state.clicks[sIdx + "-" + fr] && !state.grade) {
          btn.classList.add("find-on");
        }
        var wire = document.createElement("span");
        wire.className = "string-wire";
        wire.style.height = (sIdx === 0 ? 3 : sIdx === 1 ? 2.5 : 2) + "px";
        btn.appendChild(wire);
        var info = cellDot(sIdx, fr, tun, noteMap, gradeMap);
        if (info) {
          var dot = document.createElement("span");
          dot.className = "dot" + (info.cls ? " " + info.cls : "");
          if (info.cls === "warn" && info.label.indexOf("→") >= 0) {
            var parts = info.label.split("→");
            dot.appendChild(document.createTextNode(parts[0]));
            var sub = document.createElement("span");
            sub.textContent = "→" + parts.slice(1).join("→");
            dot.appendChild(sub);
          } else {
            dot.textContent = info.label;
          }
          btn.appendChild(dot);
        }
        btn.addEventListener("click", (function (ss, ff, el) {
          return function () { cellClick(ss, ff, el); };
        })(sIdx, fr, btn));
        row.appendChild(btn);
      }
      box.appendChild(row);
    }

    var inl = document.createElement("div");
    inl.className = "inlay-row";
    inl.appendChild(document.createElement("span"));
    for (var i = 0; i <= tun.frets; i++) {
      var cell = document.createElement("span");
      cell.className = "inlay";
      var n = INLAYS[i] || 0;
      for (var k = 0; k < n; k++) cell.appendChild(document.createElement("i"));
      inl.appendChild(cell);
    }
    box.appendChild(inl);
  }

  function fillSelects() {
    var keySel = document.getElementById("keySel");
    if (!keySel.options.length) {
      T.KEYS.forEach(function (k, i) {
        var o = document.createElement("option");
        o.value = String(i);
        keySel.appendChild(o);
      });
    }
    Array.prototype.forEach.call(keySel.options, function (o, i) {
      var k = T.KEYS[i];
      var nm = T.tonicNameOf(k, state.useEnh);
      var sc = T.scaleById(state.scale);
      o.textContent = sc.quality === "minor" ? nm + " 小調" : sc.quality === "major" ? nm + " 大調" : nm;
    });
    keySel.value = String(state.key);
    var spell = document.getElementById("spellBtn");
    var k = T.KEYS[state.key];
    if (k.enh) {
      spell.hidden = false;
      spell.textContent = "改寫成 " + (state.useEnh ? k.name : k.enh);
    } else spell.hidden = true;

    var scaleSel = document.getElementById("scaleSel");
    if (!scaleSel.options.length) {
      T.SCALES.forEach(function (s) {
        var o = document.createElement("option");
        o.value = s.id;
        o.textContent = s.name;
        scaleSel.appendChild(o);
      });
    }
    scaleSel.value = state.scale;
  }

  function renderLegend() {
    var ul = document.getElementById("legend");
    if (state.mode === "quiz" && state.grade) {
      ul.innerHTML = '<li><span class="sw sw-ok"></span>對了</li>' +
        '<li><span class="sw sw-warn"></span>位置對、音名錯</li>' +
        '<li><span class="sw sw-bad"></span>多點了</li>' +
        '<li><span class="sw sw-miss"></span>漏了</li>';
    } else if (state.mode === "quiz") {
      var hint = state.question && state.question.hint;
      ul.innerHTML = '<li>反黃的格子是這個指型的把位</li>' +
        ((hint === "full" || hint === "soft") ? '<li><span class="sw sw-outline"></span>淡圈是這個指型的全部音</li>' : "") +
        (state.question && state.question.kind === "identify"
          ? '<li>深圈是要作答的音</li>'
          : '<li>請在把位裡點出題目指定的數字音</li>');
    } else {
      ul.innerHTML = '<li><span class="sw sw-scale"></span>音階音</li>' +
        '<li><span class="sw sw-tonic"></span>主音</li>';
    }
  }

  function stringPhrase(board, string, fret) {
    var tun = T.TUNINGS[board];
    return (tun.stringCount - string) + " 弦第 " + fret + " 格";
  }

  function fillLevelBtns() {
    var box = document.getElementById("levelBtns");
    if (!box || box.getAttribute("data-ready")) return;
    T.QUIZ_LEVELS.forEach(function (lv) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-level", String(lv.id));
      b.setAttribute("role", "radio");
      b.textContent = "第 " + lv.id + " 級";
      box.appendChild(b);
    });
    box.setAttribute("data-ready", "1");
  }

  function fillShapeLockBtns() {
    var box = document.getElementById("shapeLockBtns");
    if (!box || box.getAttribute("data-ready")) return;
    var all = document.createElement("button");
    all.type = "button";
    all.setAttribute("data-shape", "all");
    all.setAttribute("role", "radio");
    all.textContent = "全部／依關卡";
    box.appendChild(all);
    T.PATTERNS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-shape", String(p.id));
      b.setAttribute("role", "radio");
      b.textContent = p.label.replace(" 指型", "");
      box.appendChild(b);
    });
    box.setAttribute("data-ready", "1");
  }

  function renderBanner(q) {
    var banner = document.getElementById("quizBanner");
    var on = state.mode === "quiz" && q;
    banner.hidden = !on;
    document.getElementById("quizLevelName").textContent = T.levelById(state.level).name;
    document.getElementById("quizScore").textContent = String(state.score);
    document.getElementById("quizStreak").textContent = String(state.streak);
    if (!on) return;
    var pr = q.prompt || {};
    banner.querySelector(".kicker").textContent = pr.kicker || "";
    banner.querySelector(".q-title").textContent = pr.title || "";
    banner.querySelector(".q-shape").textContent = pr.shape || "";
    banner.querySelector(".q-ask").textContent = pr.ask || "";
    document.getElementById("quizPrompt").textContent = pr.text || "";
    var slots = document.getElementById("quizSlots");
    slots.innerHTML = "";
    if (q.kind === "identify") {
      q.targets.forEach(function (tg, i) {
        var click = state.clicks[tg.key];
        var deg = click && (click.degree || click.name);
        var li = document.createElement("li");
        li.className = deg ? "" : "empty";
        li.innerHTML = "<span>" + (i + 1) + ". " + stringPhrase(q.board, tg.string, tg.fret) + "</span>" +
          '<span class="slot-deg">' + (deg || "？") + "</span>";
        slots.appendChild(li);
      });
    } else if (q.kind === "find") {
      q.targetDegrees.forEach(function (d) {
        var found = false;
        if (state.grade) found = (state.grade.foundDegrees || []).indexOf(d) >= 0;
        var li = document.createElement("li");
        li.className = found ? "" : "empty";
        li.innerHTML = '<span class="slot-deg">' + d + "</span>" + (state.grade ? (found ? " 找到了" : " 還沒找到") : " 請點出來");
        slots.appendChild(li);
      });
    }
  }

  function renderQuiz() {
    var qOn = state.mode === "quiz";
    var q = state.question;
    document.getElementById("quizBox").hidden = !qOn;
    ["playGroup", "labelGroup", "browseSettings", "scaleGroup", "patGroup"].forEach(function (id) {
      document.getElementById(id).hidden = qOn;
    });
    fillLevelBtns();
    fillShapeLockBtns();
    document.querySelectorAll("#levelBtns button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-level") === String(state.level));
    });
    document.querySelectorAll("#shapeLockBtns button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-shape") === String(state.shapeLock));
    });
    var lv = T.levelById(state.level);
    var lockHint = document.getElementById("shapeLockHint");
    if (state.shapeLock !== "all") {
      lockHint.textContent = "現在只練" + T.patternLabel(+state.shapeLock) + "，每一級都出這個指型。";
    } else {
      lockHint.textContent = "選「全部／依關卡」時，前面關卡先練 La 指型，愈後面指型愈多。也可以鎖成單一指型，專門練那一個。";
    }
    document.getElementById("levelHint").textContent = lv.blurb || "";
    var how;
    if (q && q.kind === "find") {
      how = "先按「聽和弦進行」，再在反黃的把位裡點出指定的數字音。再點一次可以取消。";
    } else if (q && (q.hint === "full" || q.hint === "soft")) {
      how = "淡圈是這個指型的全部音，深圈是要作答的音。點深圈，選數字音名（小調主音是 6，大調主音是 1）。";
    } else {
      how = "在畫圈的格子上點一下，選數字音名（小調主音是 6，大調主音是 1）。";
    }
    document.getElementById("quizHow").textContent = how;
    document.getElementById("playProg").hidden = !(qOn && q && q.kind === "find" && !state.grade);
    document.getElementById("stopProg").hidden = !(qOn && q && q.kind === "find" && A.isPlaying && A.isPlaying());
    renderBanner(qOn ? q : null);
    var res = document.getElementById("quizResult");
    var upBtn = document.getElementById("levelUpBtn");
    upBtn.hidden = true;
    if (qOn && state.grade) {
      res.hidden = false;
      res.className = "shown";
      var g = state.grade;
      var bits = [];
      bits.push('<strong class="score">' + g.percent + " 分</strong>");
      if (q.kind === "find") bits.push("找到 " + (g.foundDegrees ? g.foundDegrees.length : g.correct.length) + "／" + g.expectedCount + " 個指定音");
      else bits.push("對了 " + g.correct.length + "／" + g.expectedCount + " 個音");
      if (g.wrongName && g.wrongName.length) bits.push("音名錯 " + g.wrongName.length + " 處");
      if (g.missing.length) bits.push("漏了 " + g.missing.length + " 處");
      if (g.extra.length) bits.push("多點 " + g.extra.length + " 處");
      if (g.perfect) bits.push("全部正確！");
      if (state.pendingLevelUp) {
        bits.push('<p class="levelup">連對 ' + state.streak + " 題，可以升到" + T.levelById(state.level + 1).name + "了！</p>");
        upBtn.hidden = false;
      }
      res.innerHTML = bits[0] + bits.slice(1).join("，");
    } else {
      res.hidden = true;
      res.innerHTML = "";
      res.className = "";
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  function renderExplainHtml(g) {
    var ex = g.explain;
    if (!ex) return "";
    var html = '<div id="explain">';
    html += "<h2>解說</h2>";
    html += '<p class="formula"><strong>' + escapeHtml(T.scaleById(state.question.scale).name) + "的全半音公式</strong>：" + escapeHtml(ex.formula.text) + "</p>";
    html += '<p class="walk" aria-label="從主音一步一步走">';
    ex.walk.forEach(function (step, i) {
      html += (i ? "、" : "") + '<span class="walk-step' + (step.highlight ? " bad" : "") + '">' + escapeHtml(step.text) + "</span>";
    });
    html += "</p>";
    if (ex.hasErrors) {
      html += '<ol class="explain-list">';
      ex.errors.forEach(function (e) {
        html += '<li class="explain-item ' + e.kind + '" id="explain-' + e.key + '" data-key="' + e.key + '">';
        html += "<strong>" + escapeHtml(e.title) + "</strong>";
        html += "<p>" + escapeHtml(e.text) + "</p></li>";
      });
      html += "</ol>";
    } else {
      html += "<p>這題全對。上面是這次音階的全半音走法，可以再對一次。</p>";
    }
    html += '<p class="hint tip">' + escapeHtml(ex.tip) + "</p>";
    html += "</div>";
    return html;
  }

  function showCellExplain(string, fret) {
    var key = string + "-" + fret;
    document.querySelectorAll(".explain-item.on, .cell.explain-on").forEach(function (el) {
      el.classList.remove("on");
      el.classList.remove("explain-on");
    });
    var item = document.getElementById("explain-" + key);
    var cell = document.querySelector('.cell[data-string="' + string + '"][data-fret="' + fret + '"]');
    if (cell) cell.classList.add("explain-on");
    if (item) {
      item.classList.add("on");
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function setSeg(sel, attr, val) {
    document.querySelectorAll(sel + " button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute(attr) === String(val));
    });
  }

  function render() {
    fillSelects();
    setSeg("#modeBtns", "data-mode", state.mode);
    setSeg("#boardBtns", "data-board", state.board);
    setSeg("#instBtns", "data-inst", state.inst);
    setSeg("#labelBtns", "data-label", state.label);
    document.querySelectorAll("#patBtns button").forEach(function (b) {
      var id = b.getAttribute("data-pattern");
      b.classList.toggle("on", !state.showAll && String(state.pattern) === id);
      if (id === "all") b.classList.toggle("on", !!state.showAll);
    });
    document.getElementById("instHint").textContent = (A.INSTRUMENTS[state.inst].hint || "");
    var isMode = T.isModeScale(state.scale);
    document.getElementById("playMode").hidden = state.mode !== "browse" || !isMode;
    document.getElementById("modeHint").hidden = state.mode !== "browse" || !isMode;
    document.getElementById("playScaleAll").hidden = state.mode !== "browse";
    var an = T.anchorFrets(tonicName(), state.scale, state.pattern, T.TUNINGS[state.board].frets);
    var solfaLab = an.lowSolfaLabel || T.solfaDisplay(an.solfa);
    var tonicSolfa = T.isMinorSystem(state.scale) ? "La" : "Do";
    document.querySelectorAll("#patBtns button[data-pattern]").forEach(function (b) {
      var id = b.getAttribute("data-pattern");
      if (id === "all") return;
      b.textContent = T.patternLabel(+id);
    });
    if (state.showAll && state.mode === "browse") {
      document.getElementById("boardHint").textContent =
        "上面是最細的弦（1 弦），跟 TAB 譜一樣。指板可左右滑動。正在顯示這個音階的全部把位。主音當 " + tonicSolfa + "。";
    } else {
      document.getElementById("boardHint").textContent =
        "上面是最細的弦（1 弦），跟 TAB 譜一樣。指板可左右滑動。這個指型在第 " +
        an.anchors.join("、") + " 格（主音當 " + tonicSolfa + "，6 弦最低音是 " + solfaLab + "）。";
    }
    renderQuiz();
    buildBoard();
    renderLegend();
    if (state.mode === "quiz" && state.question) scrollToFret(state.question.statedAnchor);
    else if (!state.showAll && an.anchors.length) {
      var focus = an.anchors[an.anchors.length - 1];
      scrollToFret(focus > 4 ? focus : 0);
    }
  }

  function defaultInstForBoard() {
    return state.board === "bass" ? "bass" : "acoustic";
  }

  function collectScope() {
    function checked(id) {
      return Array.prototype.map.call(document.querySelectorAll("#" + id + " input:checked"), function (i) { return i.value; });
    }
    var boards = checked("scopeBoards");
    var scales = checked("scopeScales");
    var pats = checked("scopePats").map(function (v) { return +v; });
    return {
      boards: boards.length ? boards : ["guitar"],
      scales: scales.length ? scales : ["harMinor"],
      patterns: pats.length ? pats : [3],
      useEnh: state.useEnh
    };
  }

  function newQuestion(forced) {
    state.clicks = {};
    state.grade = null;
    state.pendingLevelUp = false;
    if (A.stopTransport) A.stopTransport();
    state.question = forced || T.randomQuizQuestion({ level: state.level, board: state.board, shapeLock: state.shapeLock });
    if (!state.question) return;
    state.board = state.question.board;
    state.scale = state.question.scale;
    state.pattern = state.question.pattern;
    state.showAll = false;
    var k = T.keyByName(state.question.tonic);
    state.key = T.KEYS.indexOf(k);
    if (state.key < 0) state.key = 0;
    if (T.KEYS[state.key].enh === state.question.tonic) state.useEnh = true;
    else if (T.KEYS[state.key].name === state.question.tonic) state.useEnh = false;
    if (state.autoInst) state.inst = defaultInstForBoard();
    render();
  }

  function applyGrade(g) {
    state.grade = g;
    if (g && g.perfect) {
      state.streak += 1;
      state.score += 10 + Math.min(10, state.streak) * 2;
      var lv = T.levelById(state.level);
      if (state.streak >= (lv.streakToUp || 3) && state.level < T.QUIZ_LEVELS.length) state.pendingLevelUp = true;
    } else {
      state.streak = 0;
      state.pendingLevelUp = false;
    }
  }

  function playQuizProgression() {
    var q = state.question;
    if (!q || !q.progression) return;
    A.unlock();
    A.startProgression(q.progression, { bpm: 92, drums: true, inst: "acoustic", loop: false, beatsPerChord: 2 });
    renderQuiz();
  }

  function playScaleOrMode(asMode) {
    A.unlock();
    if (A.stopTransport) A.stopTransport();
    var tonic = tonicName();
    var plan = T.modeListenPlan(tonic, state.scale);
    plan.scaleMidis.forEach(function (m, i) {
      setTimeout(function () { A.playMidi(m, state.inst === "bass" ? "bass" : "acoustic"); }, i * 280);
    });
    if (asMode && plan.vampDegrees) {
      var wait = plan.scaleMidis.length * 280 + 250;
      setTimeout(function () {
        A.startProgression({ tonic: tonic, minor: plan.minorColor, degrees: plan.vampDegrees }, { bpm: 88, drums: true, inst: "acoustic", loop: false, beatsPerChord: 2 });
      }, wait);
    }
  }

  function initPanel() {
    A.INST_ORDER.forEach(function (id) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-inst", id);
      b.setAttribute("role", "radio");
      b.textContent = A.INSTRUMENTS[id].label;
      b.addEventListener("click", function () {
        state.inst = id;
        state.autoInst = false;
        A.loadInst(id);
        render();
      });
      document.getElementById("instBtns").appendChild(b);
    });
    T.PATTERNS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-pattern", String(p.id));
      b.setAttribute("role", "radio");
      b.textContent = p.label;
      b.addEventListener("click", function () {
        state.pattern = p.id;
        state.showAll = false;
        render();
      });
      document.getElementById("patBtns").appendChild(b);
    });
    var all = document.createElement("button");
    all.type = "button";
    all.setAttribute("data-pattern", "all");
    all.textContent = "全部把位";
    all.addEventListener("click", function () { state.showAll = true; render(); });
    document.getElementById("patBtns").appendChild(all);

    fillLevelBtns();
    fillShapeLockBtns();
    document.getElementById("shapeLockBtns").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-shape]");
      if (!b) return;
      state.shapeLock = b.getAttribute("data-shape");
      if (state.mode === "quiz") newQuestion();
      else render();
    });
    document.getElementById("levelBtns").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-level]");
      if (!b) return;
      state.level = +b.getAttribute("data-level");
      state.streak = 0;
      state.pendingLevelUp = false;
      if (state.mode === "quiz") newQuestion();
      else render();
    });

    document.getElementById("modeBtns").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-mode]");
      if (!b) return;
      state.mode = b.getAttribute("data-mode");
      closePop();
      if (state.mode === "quiz" && !state.question) newQuestion();
      else render();
    });
    document.getElementById("boardBtns").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-board]");
      if (!b) return;
      state.board = b.getAttribute("data-board");
      if (state.autoInst) state.inst = defaultInstForBoard();
      if (state.mode === "quiz") newQuestion();
      else render();
    });
    document.getElementById("keySel").addEventListener("change", function () {
      state.key = +this.value;
      render();
    });
    document.getElementById("spellBtn").addEventListener("click", function () {
      state.useEnh = !state.useEnh;
      render();
    });
    document.getElementById("scaleSel").addEventListener("change", function () {
      state.scale = this.value;
      render();
    });
    document.getElementById("labelBtns").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-label]");
      if (!b) return;
      state.label = b.getAttribute("data-label");
      render();
    });
    document.getElementById("playPat").addEventListener("click", function () {
      var an = T.anchorFrets(tonicName(), state.scale, state.pattern, T.TUNINGS[state.board].frets);
      var anchor = an.anchors[an.anchors.length - 1] || an.anchors[0];
      var notes = T.patternNotes(state.board, tonicName(), state.scale, state.pattern, anchor)
        .sort(function (a, b) { return a.string - b.string || a.fret - b.fret; });
      if (A.stopTransport) A.stopTransport();
      else A.stopAll();
      notes.forEach(function (n, i) {
        setTimeout(function () { A.playMidi(n.midi, state.inst); }, i * 320);
      });
    });
    document.getElementById("playScaleAll").addEventListener("click", function () { playScaleOrMode(false); });
    document.getElementById("playMode").addEventListener("click", function () { playScaleOrMode(true); });
    document.getElementById("playProg").addEventListener("click", function () { playQuizProgression(); });
    document.getElementById("stopProg").addEventListener("click", function () {
      if (A.stopTransport) A.stopTransport();
      renderQuiz();
    });
    document.getElementById("nextQ").addEventListener("click", function () { newQuestion(); });
    document.getElementById("levelUpBtn").addEventListener("click", function () {
      if (!state.pendingLevelUp) return;
      state.level += 1;
      state.streak = 0;
      state.pendingLevelUp = false;
      newQuestion();
    });
    document.getElementById("submitQ").addEventListener("click", function () {
      if (!state.question) return;
      var clicks = Object.keys(state.clicks).map(function (k) { return state.clicks[k]; });
      applyGrade(T.gradeQuizQuestion(clicks, state.question));
      closePop();
      if (A.stopTransport) A.stopTransport();
      render();
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest("#namePop") && !e.target.closest(".cell")) closePop();
    });
  }

  initPanel();
  A.loadInst(state.inst);
  render();

  window.__fretboard = {
    state: state,
    render: render,
    newQuestion: newQuestion,
    tonicName: tonicName,
    currentNotes: currentNotes,
    scrollToFret: scrollToFret,
    collectScope: collectScope, showCellExplain: showCellExplain,
    applyGrade: applyGrade, playQuizProgression: playQuizProgression,
    setState: function (p) {
      Object.keys(p).forEach(function (k) { state[k] = p[k]; });
      render();
    }
  };
})();
