/* 十二音圓形音階：點圓上的音就發出音高（Web Audio + 自架取樣） */
(function () {
  "use strict";

  var PC_NAMES = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"];
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  var FILE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  // 取樣：每個八度取 C、Eb、Gb、A 四個音，其他音用最近的取樣移調（最多一個半音）。
  // octShift：以畫面上的八度為準，實際發聲再移幾個八度（Bass 低兩個八度）。
  function grid(lo, hi) {
    var list = [];
    for (var m = lo; m <= hi; m++) if ([0, 3, 6, 9].indexOf(m % 12) >= 0) list.push(m);
    return list;
  }
  var INSTRUMENTS = {
    piano: { label: "鋼琴", dir: "piano", notes: grid(48, 84), octShift: 0 },
    acoustic: { label: "木吉他", dir: "acoustic", notes: grid(48, 84), octShift: 0 },
    electric: { label: "電吉他", dir: "electric", notes: grid(48, 84), octShift: 0 },
    bass: { label: "Bass", dir: "bass", notes: grid(24, 60), octShift: -2, hint: "Bass 實際音高比畫面上的八度低兩個八度。" },
    voice: { label: "人聲", dir: "voice", notes: grid(48, 84), octShift: 0 },
    // 老師的聲音：老師唱的「啊」#F3（已校正到 185.0 Hz），一個取樣移調成 12 個音。
    // 男聲，實際比畫面上的八度低一個八度：預設 C4–B4 會發出 C3–B3，都在 #F3 上下半個八度內。
    teacher: { label: "老師的聲音", dir: "teacher", notes: [54], files: { 54: "Fs3" }, octShift: -1, single: true,
      hint: "老師的聲音比顯示低一個八度。" }
  };
  var INST_ORDER = ["piano", "acoustic", "electric", "bass", "voice", "teacher"];

  // 12 個大調。enh：可切換的同音異名寫法。
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
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SOLFA = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

  function spellMajor(tonicName) {
    var letter = tonicName[0];
    var acc = tonicName.slice(1) === "#" ? 1 : tonicName.slice(1) === "b" ? -1 : 0;
    var tonicPc = (LETTER_PC[letter] + acc + 12) % 12;
    var li = LETTERS.indexOf(letter);
    var out = {};
    for (var d = 0; d < 7; d++) {
      var L = LETTERS[(li + d) % 7];
      var pc = (tonicPc + MAJOR[d]) % 12;
      var diff = ((pc - LETTER_PC[L]) % 12 + 18) % 12 - 6; // -6..5
      var s = diff === 0 ? "" : diff > 0 ? new Array(diff + 1).join("#") : new Array(-diff + 1).join("b");
      out[pc] = { name: L + s, degree: d };
    }
    return out;
  }

  // ---------- 狀態 ----------
  var state = { inst: "piano", key: -1, useEnh: false, label: "num", octave: 4 };
  var OCT_MIN = 3, OCT_MAX = 5;

  // ---------- 音訊 ----------
  var ctx = null, master = null;
  var buffers = {}; // inst -> {midi: AudioBuffer}
  var loading = {};
  window.__noteLog = [];
  window.__sampleStatus = {};

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: "interactive" });
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    return ctx;
  }
  // iOS：第一次觸碰時解鎖音訊
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    unlocked = true;
  }
  ["pointerdown", "touchstart", "keydown", "mousedown"].forEach(function (ev) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  });

  function midiName(m) { return FILE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }

  function loadInst(id) {
    if (loading[id]) return loading[id];
    ensureCtx();
    var inst = INSTRUMENTS[id];
    buffers[id] = buffers[id] || {};
    var ok = 0, fail = 0;
    loading[id] = Promise.all(inst.notes.map(function (m) {
      var url = "samples/" + inst.dir + "/" + ((inst.files && inst.files[m]) || midiName(m)) + ".mp3";
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + " " + r.status);
        return r.arrayBuffer();
      }).then(function (ab) {
        return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); });
      }).then(function (buf) { buffers[id][m] = buf; ok++; })
        .catch(function (e) { fail++; console.warn("取樣載入失敗", e); });
    })).then(function () {
      window.__sampleStatus[id] = { ok: ok, fail: fail, total: inst.notes.length };
      return buffers[id];
    });
    return loading[id];
  }

  function nearest(id, midi) {
    var best = null, bd = 1e9, bufs = buffers[id] || {};
    Object.keys(bufs).forEach(function (k) {
      var d = Math.abs(+k - midi);
      if (d < bd) { bd = d; best = +k; }
    });
    return best;
  }

  function soundingMidi(pc) {
    return 12 * (state.octave + 1) + pc + 12 * INSTRUMENTS[state.inst].octShift;
  }

  function playMidi(midi, when) {
    var id = state.inst;
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    return loadInst(id).then(function () {
      var s = nearest(id, midi);
      if (s === null) return;
      var rate = Math.pow(2, (midi - s) / 12);
      var src = ctx.createBufferSource();
      src.buffer = buffers[id][s];
      src.playbackRate.value = rate;
      var g = ctx.createGain();
      var t = Math.max(ctx.currentTime, when || 0);
      var dur = Math.min(src.buffer.duration / rate, 3.0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.005);
      g.gain.setValueAtTime(1, t + dur - 0.4);
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.connect(g); g.connect(master);
      src.start(t);
      src.stop(t + dur + 0.05);
      var freq = 440 * Math.pow(2, (midi - 69) / 12);
      window.__noteLog.push({ inst: id, midi: midi, freq: +freq.toFixed(2), sample: s, rate: +rate.toFixed(4), t: t });
    });
  }

  // ---------- 畫圓 ----------
  var svg = document.getElementById("circle");
  var NS = "http://www.w3.org/2000/svg";
  var CX = 300, CY = 300, R = 228, NR = 50;
  var noteEls = [];
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  el("circle", { cx: CX, cy: CY, r: R, "class": "ring" }, svg);
  var centerMain = el("text", { x: CX, y: CY - 8, "class": "center-main" }, svg);
  var centerSub = el("text", { x: CX, y: CY + 30, "class": "center-sub" }, svg);

  for (var pc = 0; pc < 12; pc++) {
    var a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
    var x = CX + R * Math.cos(a), y = CY + R * Math.sin(a);
    var g = el("g", { "class": "note " + (BLACK[pc] ? "black" : "white"), tabindex: "0", role: "button", "data-pc": pc }, svg);
    el("circle", { cx: x, cy: y, r: NR + 4, "class": "glow" }, g);
    el("circle", { cx: x, cy: y, r: NR, "class": "body" }, g);
    var name = el("text", { x: x, y: y, "class": "name" }, g);
    // 級數標在圓外側
    var dx = CX + (R + NR + 22) * Math.cos(a), dy = CY + (R + NR + 22) * Math.sin(a);
    var deg = el("text", { x: dx, y: dy, "class": "deg" }, g);
    noteEls.push({ g: g, name: name, deg: deg, x: x, y: y });
  }

  function setName(t, label, x, y) {
    while (t.firstChild) t.removeChild(t.firstChild);
    var parts = label.split("/");
    t.setAttribute("class", "name" + (parts.length > 1 ? " two" : ""));
    if (parts.length === 1) { t.textContent = label; t.setAttribute("y", y); return; }
    parts.forEach(function (p, i) {
      var ts = el("tspan", { x: x, dy: i === 0 ? "-0.55em" : "1.1em" }, t);
      ts.textContent = p;
    });
    t.setAttribute("y", y);
  }

  function keyName() {
    if (state.key < 0) return "";
    var k = KEYS[state.key];
    return state.useEnh && k.enh ? k.enh : k.name;
  }

  function render() {
    var root = document.documentElement;
    var spelled = null;
    if (state.key >= 0) spelled = spellMajor(keyName());
    root.classList.toggle("has-key", !!spelled);
    var tonicPc = state.key >= 0 ? KEYS[state.key].pc : -1;
    noteEls.forEach(function (n, pc) {
      var info = spelled && spelled[pc];
      n.g.classList.toggle("in", !!info);
      n.g.classList.toggle("out", !!spelled && !info);
      n.g.classList.toggle("tonic", pc === tonicPc);
      var label = info ? info.name : PC_NAMES[pc];
      setName(n.name, label, n.x, n.y);
      n.g.setAttribute("data-name", label);
      n.deg.textContent = info ? (state.label === "num" ? String(info.degree + 1) : SOLFA[info.degree]) : "";
      n.g.setAttribute("aria-label", label.replace("/", " 或 ") + (info ? "，第 " + (info.degree + 1) + " 級" : ""));
    });
    if (spelled) {
      centerMain.textContent = keyName() + " 大調";
      centerSub.textContent = keyName() + " Major";
    } else {
      centerMain.textContent = "12 音階";
      centerSub.textContent = "Chromatic Circle";
    }
    var k = state.key >= 0 ? KEYS[state.key] : null;
    var sb = document.getElementById("spellBtn");
    if (k && k.enh) { sb.hidden = false; sb.textContent = "改寫成 " + (state.useEnh ? k.name : k.enh); }
    else sb.hidden = true;
    var shift = INSTRUMENTS[state.inst].octShift;
    document.getElementById("octText").textContent = "C" + state.octave + "–B" + state.octave;
    document.getElementById("octHint").textContent = shift ? INSTRUMENTS[state.inst].label + " 實際發出 C" + (state.octave + shift) + "–B" + (state.octave + shift) + "（低" + (shift === -1 ? "一" : "兩") + "個八度）。" : (state.octave === 4 ? "預設是中央 C（C4）這個八度。" : "按 − ＋ 換八度，中央 C 是 C4。");
    document.getElementById("octDown").disabled = state.octave <= OCT_MIN;
    document.getElementById("octUp").disabled = state.octave >= OCT_MAX;
    var ib = document.querySelectorAll("#instBtns button");
    for (var i = 0; i < ib.length; i++) ib[i].classList.toggle("on", ib[i].getAttribute("data-inst") === state.inst);
    var lb = document.querySelectorAll("#labelBtns button");
    for (var j = 0; j < lb.length; j++) lb[j].classList.toggle("on", lb[j].getAttribute("data-label") === state.label);
    document.getElementById("instHint").textContent = INSTRUMENTS[state.inst].hint || "";
  }

  function flash(pc) {
    var g = noteEls[pc].g;
    g.classList.remove("lit");
    void g.getBoundingClientRect();
    g.classList.add("lit");
    clearTimeout(g.__t);
    g.__t = setTimeout(function () { g.classList.remove("lit"); }, 750);
  }

  function hit(pc) {
    unlock();
    flash(pc);
    return playMidi(soundingMidi(pc));
  }

  noteEls.forEach(function (n, pc) {
    n.g.addEventListener("pointerdown", function (e) { e.preventDefault(); hit(pc); });
    n.g.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hit(pc); }
    });
  });

  // ---------- 控制 ----------
  var instBox = document.getElementById("instBtns");
  INST_ORDER.forEach(function (id) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-inst", id);
    b.setAttribute("role", "radio");
    b.textContent = INSTRUMENTS[id].label;
    b.addEventListener("click", function () {
      state.inst = id; render();
      var st = document.getElementById("status");
      st.textContent = "載入" + INSTRUMENTS[id].label + "音色中…";
      loadInst(id).then(function () { st.textContent = ""; });
    });
    instBox.appendChild(b);
  });

  var sel = document.getElementById("keySel");
  var o0 = document.createElement("option"); o0.value = "-1"; o0.textContent = "不選調（顯示全部 12 音）"; sel.appendChild(o0);
  KEYS.forEach(function (k, i) {
    var o = document.createElement("option");
    o.value = String(i);
    o.textContent = (k.enh ? k.name + " / " + k.enh : k.name) + " 大調";
    sel.appendChild(o);
  });
  // 預設不選調（讓學生自己找音階）；不記住上次選的調，也不讓瀏覽器自動還原選單
  sel.value = "-1"; state.key = -1;
  window.addEventListener("pageshow", function () { if (sel.value !== String(state.key)) { sel.value = "-1"; state.key = -1; render(); } });
  sel.addEventListener("change", function () { state.key = +sel.value; state.useEnh = false; render(); });
  document.getElementById("spellBtn").addEventListener("click", function () { state.useEnh = !state.useEnh; render(); });
  document.querySelectorAll("#labelBtns button").forEach(function (b) {
    b.addEventListener("click", function () { state.label = b.getAttribute("data-label"); render(); });
  });
  document.getElementById("octDown").addEventListener("click", function () { if (state.octave > OCT_MIN) { state.octave--; render(); } });
  document.getElementById("octUp").addEventListener("click", function () { if (state.octave < OCT_MAX) { state.octave++; render(); } });

  var scaleTimers = [];
  document.getElementById("playScale").addEventListener("click", function () {
    unlock();
    scaleTimers.forEach(clearTimeout); scaleTimers = [];
    var start = state.key >= 0 ? KEYS[state.key].pc : 0;
    var steps = state.key >= 0 ? MAJOR.concat([12]) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    var gap = state.key >= 0 ? 0.42 : 0.3;
    var base = soundingMidi(0) + start;
    var maxS = Math.max.apply(null, INSTRUMENTS[state.inst].notes);
    // 多取樣的音色不要超出最高取樣；單一取樣（老師的聲音）照畫面上的八度播
    if (!INSTRUMENTS[state.inst].single && base + 12 > maxS + 1) base -= 12;
    loadInst(state.inst).then(function () {
      var t0 = ctx.currentTime + 0.05;
      steps.forEach(function (st, i) {
        var semis = start + st;
        playMidi(base + st, t0 + i * gap);
        scaleTimers.push(setTimeout(function () { flash(semis % 12); }, 50 + i * gap * 1000));
      });
    });
  });

  window.__noteCircle = { state: state, spellMajor: spellMajor, render: render, loadInst: loadInst, INSTRUMENTS: INSTRUMENTS, KEYS: KEYS };

  render();
  // 先載入鋼琴（不需要使用者手勢；解碼可在 suspended 狀態完成）
  loadInst("piano");
})();
