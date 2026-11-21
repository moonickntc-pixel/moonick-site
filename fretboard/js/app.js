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
    pattern: 3, // la
    showAll: false,
    label: "name",
    question: null,
    clicks: {},
    grade: null,
    autoInst: true
  };
  var INLAYS = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1 };

  function tonicName() {
    return T.tonicNameOf(T.KEYS[state.key], state.useEnh);
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
    var names = [], seen = {};
    function add(n) { if (n && !seen[n]) { seen[n] = 1; names.push(n); } }
    spelled.notes.forEach(function (n) { add(n.name); });
    var major = T.spellScale(spelled.parent.name, "major");
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(function (pc) {
      if (major.byPc[pc]) add(major.byPc[pc].name);
    });
    ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"].forEach(add);
    if (pcPreferred != null && spelled.byPc[pcPreferred]) {
      var pref = spelled.byPc[pcPreferred].name;
      names = [pref].concat(names.filter(function (n) { return n !== pref; }));
    }
    return names;
  }

  function openNamePop(cell, string, fret) {
    closePop();
    var tun = T.TUNINGS[state.board];
    var midi = tun.openMidi[string] + fret;
    var pop = document.createElement("div");
    pop.id = "namePop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "選音名");
    nameChoices(midi % 12).forEach(function (nm) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = nm;
      b.setAttribute("data-name", nm);
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var key = string + "-" + fret;
        state.clicks[key] = { string: string, fret: fret, name: nm };
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
      showCellExplain(string, fret);
      A.playMidi(midi, state.inst);
      return;
    }
    openNamePop(cell, string, fret);
  }

  function cellDot(s, fr, tun, noteMap, gradeMap) {
    var key = s + "-" + fr;
    if (state.mode === "quiz" && state.grade && gradeMap[key]) {
      return { cls: gradeMap[key].kind, label: gradeMap[key].label };
    }
    if (state.mode === "quiz" && state.clicks[key]) {
      var qTonic = state.question ? state.question.tonic : tonicName();
      var qScale = state.question ? state.question.scale : state.scale;
      var rec = T.spellScale(qTonic, qScale).byPc[(tun.openMidi[s] + fr) % 12];
      return { cls: rec && rec.iv === 0 ? "tonic" : "", label: state.clicks[key].name };
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
      ul.innerHTML = '<li><span class="sw sw-ok"></span>位置與音名都對</li>' +
        '<li><span class="sw sw-warn"></span>位置對、音名錯</li>' +
        '<li><span class="sw sw-bad"></span>多點了</li>' +
        '<li><span class="sw sw-miss"></span>漏點了</li>';
    } else {
      ul.innerHTML = '<li><span class="sw sw-scale"></span>音階音</li>' +
        '<li><span class="sw sw-tonic"></span>主音</li>';
    }
  }

  function renderQuiz() {
    var qOn = state.mode === "quiz";
    document.getElementById("quizBox").hidden = !qOn;
    ["playGroup", "labelGroup", "browseSettings", "scaleGroup", "patGroup"].forEach(function (id) {
      document.getElementById(id).hidden = qOn;
    });
    document.getElementById("quizPrompt").textContent = qOn && state.question ? state.question.prompt : "";
    var res = document.getElementById("quizResult");
    if (qOn && state.grade) {
      res.hidden = false;
      res.className = "shown";
      var g = state.grade;
      var bits = [];
      bits.push('<strong class="score">' + g.percent + " 分</strong>");
      bits.push("對了 " + g.correct.length + "／" + g.expectedCount + " 個音");
      if (g.wrongName.length) bits.push("音名錯 " + g.wrongName.length + " 處");
      if (g.missing.length) bits.push("漏點 " + g.missing.length + " 處");
      if (g.extra.length) bits.push("多點 " + g.extra.length + " 處");
      if (g.perfect) bits.push("全部正確！");
      if (state.question.anchors.length > 1) bits.push("（這題按第 " + g.usedAnchor + " 格的指型來批）");
      res.innerHTML = bits[0] + bits.slice(1).join("，") + renderExplainHtml(g);
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
    var parent = T.parentDo(tonicName(), state.scale);
    var an = T.anchorFrets(tonicName(), state.scale, state.pattern, T.TUNINGS[state.board].frets);
    var solfa = T.patternById(state.pattern).solfa;
    if (state.showAll && state.mode === "browse") {
      document.getElementById("boardHint").textContent =
        "上面是最細的弦（1 弦），跟 TAB 譜一樣。指板可左右滑動。正在顯示這個音階的全部把位。";
    } else {
      document.getElementById("boardHint").textContent =
        "上面是最細的弦（1 弦），跟 TAB 譜一樣。指板可左右滑動。這個指型在第 " +
        an.anchors.join("、") + " 格（關係大調 " + parent.name + " 大調的 " + solfa + "）。";
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
    state.question = forced || T.randomQuestion(collectScope());
    if (!state.question) return;
    state.board = state.question.board;
    state.scale = state.question.scale;
    state.pattern = state.question.pattern;
    state.showAll = false;
    var k = T.keyByName(state.question.tonic);
    state.key = T.KEYS.indexOf(k);
    if (T.KEYS[state.key].enh === state.question.tonic) state.useEnh = true;
    else if (T.KEYS[state.key].name === state.question.tonic) state.useEnh = false;
    if (state.autoInst) state.inst = defaultInstForBoard();
    render();
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

    T.SCALES.forEach(function (s) {
      var lab = document.createElement("label");
      var on = s.id === "harMinor" || s.id === "natMinor" || s.id === "major" || s.id === "minPent";
      lab.innerHTML = '<input type="checkbox" value="' + s.id + '"' + (on ? " checked" : "") + "> " + s.name;
      document.getElementById("scopeScales").appendChild(lab);
    });
    T.PATTERNS.forEach(function (p) {
      var lab = document.createElement("label");
      lab.innerHTML = '<input type="checkbox" value="' + p.id + '" checked> ' + p.solfa + "（" + p.id + "）";
      document.getElementById("scopePats").appendChild(lab);
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
      A.stopAll();
      notes.forEach(function (n, i) {
        setTimeout(function () { A.playMidi(n.midi, state.inst); }, i * 320);
      });
    });
    document.getElementById("nextQ").addEventListener("click", function () { newQuestion(); });
    document.getElementById("submitQ").addEventListener("click", function () {
      if (!state.question) return;
      var clicks = Object.keys(state.clicks).map(function (k) { return state.clicks[k]; });
      state.grade = T.gradeQuiz(clicks, state.question);
      closePop();
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
    setState: function (p) {
      Object.keys(p).forEach(function (k) { state[k] = p[k]; });
      render();
    }
  };
})();
