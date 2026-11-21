/* 十二音圓形音階：抓歌練習介面（聽和弦／旋律問調、組成音、級數、Jam） */
(function () {
  "use strict";
  var C = window.__noteCircle;
  var P = window.__notePracticeTheory;
  if (!C || !P) return;

  var state = {
    mode: "browse",
    level: 1,
    score: 0,
    streak: 0,
    pendingLevelUp: false,
    question: null,
    grade: null,
    choice: null,
    picked: {},
    jam: false,
    bpm: 96
  };

  var transport = { timer: null, next: 0, step: 0, playing: false, plan: null, bpm: 96, loop: false };
  var drumGain = null;

  function ctx() { return C.ensureCtx(); }
  function dest() {
    var audio = ctx();
    if (!drumGain) {
      drumGain = audio.createGain();
      drumGain.gain.value = 0.7;
      var mast = C.getMaster && C.getMaster();
      if (mast) drumGain.connect(mast);
      else drumGain.connect(audio.destination);
    }
    return drumGain;
  }
  function playKick(when) {
    var audio = ctx(), t = Math.max(audio.currentTime, when || 0), d = dest();
    var osc = audio.createOscillator(), g = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g); g.connect(d);
    osc.start(t); osc.stop(t + 0.24);
  }
  function playSnare(when) {
    var audio = ctx(), t = Math.max(audio.currentTime, when || 0), d = dest();
    var n = audio.createBufferSource();
    var frames = Math.floor(audio.sampleRate * 0.2);
    var buf = audio.createBuffer(1, frames, audio.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    var bp = audio.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.9;
    var g = audio.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    var osc = audio.createOscillator(), og = audio.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(bp); bp.connect(g); g.connect(d);
    osc.connect(og); og.connect(d);
    n.start(t); n.stop(t + 0.2);
    osc.start(t); osc.stop(t + 0.12);
  }
  function playHat(when, open) {
    var audio = ctx(), t = Math.max(audio.currentTime, when || 0), d = dest();
    var n = audio.createBufferSource();
    var frames = Math.floor(audio.sampleRate * 0.25);
    var buf = audio.createBuffer(1, frames, audio.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    var hp = audio.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 7000;
    var g = audio.createGain();
    var dur = open ? 0.18 : 0.05;
    g.gain.setValueAtTime(open ? 0.18 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp); hp.connect(g); g.connect(d);
    n.start(t); n.stop(t + dur + 0.02);
  }

  function chordMidisFor(ch) {
    return C.chordMidis(ch.rootPc, ch.type);
  }

  function beatDur() { return 60 / transport.bpm; }

  function scheduleStep(step, t, plan) {
    if (plan.drums !== false) {
      if (step % 8 === 0 || step % 8 === 4) playKick(t);
      if (step % 8 === 2 || step % 8 === 6) playSnare(t);
      playHat(t, step % 8 === 6);
    }
    var stepsPerChord = (plan.beatsPerChord || 2) * 2;
    var chordIdx = Math.floor(step / stepsPerChord) % (plan.chords || []).length;
    if (plan.chords && plan.chords.length && step % stepsPerChord === 0) {
      var midis = chordMidisFor(plan.chords[chordIdx]);
      if (C.playChord) C.playChord(midis, t);
    }
    if (plan.onBeat) plan.onBeat(step, t, chordIdx);
    var notes = document.querySelectorAll("#circle .note");
    if (plan.chords && plan.chords[chordIdx]) {
      var pcs = plan.chords[chordIdx].pcs;
      notes.forEach(function (el) {
        var pc = +el.getAttribute("data-pc");
        el.classList.toggle("jam-now", pcs.indexOf(pc) >= 0);
      });
    }
  }

  function tick() {
    var audio = ctx();
    if (!transport.playing || !audio) return;
    var horizon = audio.currentTime + 0.14;
    while (transport.next < horizon) {
      scheduleStep(transport.step, transport.next, transport.plan);
      transport.next += beatDur() / 2;
      transport.step += 1;
      if (!transport.loop) {
        var total = (transport.plan.chords || []).length * (transport.plan.beatsPerChord || 2) * 2;
        if (transport.step >= total) { stopTransport(); return; }
      }
    }
  }

  function startProgression(chords, opts) {
    opts = opts || {};
    if (C.unlock) C.unlock();
    ctx();
    if (ctx().state === "suspended") ctx().resume();
    stopTransport();
    transport.bpm = opts.bpm || state.bpm || 96;
    transport.loop = !!opts.loop;
    transport.plan = {
      chords: chords,
      beatsPerChord: opts.beatsPerChord || 2,
      drums: opts.drums !== false,
      onBeat: opts.onBeat || null
    };
    transport.step = 0;
    transport.next = ctx().currentTime + 0.06;
    transport.playing = true;
    C.loadInst(C.state.inst).then(function () {
      if (!transport.playing) return;
      tick();
      transport.timer = setInterval(tick, 25);
    });
    renderPractice();
  }

  function stopTransport() {
    transport.playing = false;
    if (transport.timer) { clearInterval(transport.timer); transport.timer = null; }
    document.querySelectorAll("#circle .note.jam-now").forEach(function (el) { el.classList.remove("jam-now"); });
    renderPractice();
  }

  function playMelody(q) {
    if (C.unlock) C.unlock();
    stopTransport();
    var pcs = q.pcs;
    var base = 60;
    // 讓旋律從主音附近往上走，不往下掉太低
    var midis = [];
    var last = base + pcs[0];
    midis.push(last);
    for (var i = 1; i < pcs.length; i++) {
      var m = base + pcs[i];
      while (m < last - 6) m += 12;
      while (m > last + 8) m -= 12;
      midis.push(m);
      last = m;
    }
    C.loadInst(C.state.inst).then(function () {
      var t0 = ctx().currentTime + 0.05;
      midis.forEach(function (m, i) {
        C.playMidi(m, t0 + i * 0.32);
        setTimeout(function () { if (C.flash) C.flash(pcs[i]); }, 50 + i * 320);
      });
    });
  }

  function fillLevels() {
    var box = document.getElementById("pracLevelBtns");
    if (!box || box.getAttribute("data-ready")) return;
    P.LEVELS.forEach(function (lv) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-level", String(lv.id));
      b.setAttribute("role", "radio");
      b.textContent = "第 " + lv.id + " 級";
      box.appendChild(b);
    });
    box.setAttribute("data-ready", "1");
  }

  function newQuestion(forced) {
    state.grade = null;
    state.choice = null;
    state.picked = {};
    state.jam = false;
    state.pendingLevelUp = false;
    stopTransport();
    C.state.key = -1;
    C.state.chord = "";
    C.state.shown = null;
    state.question = forced || P.randomPracticeQuestion({ level: state.level });
    C.render();
    renderPractice();
  }

  function applyGrade(g) {
    state.grade = g;
    if (g && g.perfect) {
      state.streak += 1;
      state.score += 10 + Math.min(10, state.streak) * 2;
      var lv = P.levelById(state.level);
      if (state.streak >= (lv.streakToUp || 3) && state.level < P.LEVELS.length) state.pendingLevelUp = true;
    } else {
      state.streak = 0;
      state.pendingLevelUp = false;
    }
  }

  function enterJam() {
    var q = state.question;
    if (!q || !q.jam) return;
    state.jam = true;
    stopTransport();
    C.render();
    renderPractice();
    startProgression(q.jam.chords, { bpm: state.bpm, drums: true, loop: true, beatsPerChord: 2 });
  }

  function paintCircle() {
    var root = document.documentElement;
    var notes = document.querySelectorAll("#circle .note");
    notes.forEach(function (el) {
      el.classList.remove("picked", "tone-ok", "tone-miss", "tone-bad");
    });
    if (state.mode !== "practice") return;
    var q = state.question;
    if (state.jam && q && q.jam) {
      var sp = P.spellScale(q.jam.tonic, q.jam.quality);
      root.classList.add("has-key");
      notes.forEach(function (el) {
        var pc = +el.getAttribute("data-pc");
        var info = sp.byPc[pc];
        el.classList.toggle("in", !!info);
        el.classList.toggle("out", !info);
        el.classList.toggle("tonic", pc === sp.tonicPc);
        var degEl = el.querySelector("text.deg");
        if (degEl) {
          if (!info) degEl.textContent = "";
          else if (q.jam.quality === "minor") degEl.textContent = P.MINOR_SHOU[info.degree];
          else degEl.textContent = String(info.degree + 1);
        }
      });
      var main = document.querySelector("#circle .center-main");
      var sub = document.querySelector("#circle .center-sub");
      if (main) main.textContent = P.keyLabel(q.jam.tonic, q.jam.quality);
      if (sub) sub.textContent = q.jam.quality === "minor" ? "自然小調　主音是 6" : "主音是 1";
      return;
    }
    if (q && q.kind === "chordTones") {
      Object.keys(state.picked).forEach(function (k) {
        var el = document.querySelector('#circle .note[data-pc="' + k + '"]');
        if (el) el.classList.add("picked");
      });
      if (state.grade) {
        (state.grade.correct || []).forEach(function (pc) {
          var el = document.querySelector('#circle .note[data-pc="' + pc + '"]');
          if (el) el.classList.add("tone-ok");
        });
        (state.grade.missing || []).forEach(function (pc) {
          var el = document.querySelector('#circle .note[data-pc="' + pc + '"]');
          if (el) el.classList.add("tone-miss");
        });
        (state.grade.extra || []).forEach(function (pc) {
          var el = document.querySelector('#circle .note[data-pc="' + pc + '"]');
          if (el) el.classList.add("tone-bad");
        });
      }
    }
  }

  function renderPractice() {
    var on = state.mode === "practice";
    document.documentElement.classList.toggle("practice-on", on);
    document.documentElement.classList.toggle("practice-jam", on && state.jam);
    document.getElementById("pracBanner").hidden = !on;
    document.getElementById("pracBox").hidden = !on;
    fillLevels();
    document.querySelectorAll("#modeBtns button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === state.mode);
    });
    document.querySelectorAll("#pracLevelBtns button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-level") === String(state.level));
    });
    var lv = P.levelById(state.level);
    document.getElementById("pracLevelHint").textContent = lv.blurb || "";
    document.getElementById("pracLevelName").textContent = lv.name.split("　")[0];
    document.getElementById("pracScore").textContent = String(state.score);
    document.getElementById("pracStreak").textContent = String(state.streak);

    var q = state.question;
    var hero = document.getElementById("pracHero");
    if (on && q && !state.jam) {
      hero.hidden = false;
      hero.querySelector(".kicker").textContent = q.prompt.kicker || "";
      hero.querySelector(".q-title").textContent = q.prompt.title || "";
      hero.querySelector(".q-ask").textContent = q.prompt.ask || "";
      document.getElementById("pracPrompt").textContent = (q.prompt.kicker || "") + " " + (q.prompt.title || "") + " " + (q.prompt.ask || "");
    } else if (on && state.jam && q) {
      hero.hidden = false;
      hero.querySelector(".kicker").textContent = "Jam 時間";
      hero.querySelector(".q-title").textContent = P.keyLabel(q.jam.tonic, q.jam.quality);
      hero.querySelector(".q-ask").textContent = "進行會一直循環，圓上只留下這個調的自然音階。點音就能一起彈。";
      document.getElementById("pracPrompt").textContent = "Jam：" + P.keyLabel(q.jam.tonic, q.jam.quality);
    } else {
      hero.hidden = true;
      document.getElementById("pracPrompt").textContent = "";
    }

    var choiceBox = document.getElementById("pracChoices");
    choiceBox.innerHTML = "";
    if (on && q && !state.jam && (q.kind === "keyFromChords" || q.kind === "keyFromMelody" || q.kind === "degreeChord")) {
      (q.choices || []).forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-choice", c.name);
        b.textContent = (q.kind === "degreeChord") ? c.name : P.keyLabel(c.name, c.quality);
        if (state.choice && ((q.kind === "degreeChord" && state.choice === c.name) || (state.choice && state.choice.name === c.name))) b.classList.add("on");
        if (state.grade) {
          if (c.correct) b.classList.add("is-ok");
          else if (state.choice && ((q.kind === "degreeChord" && state.choice === c.name) || (state.choice.name === c.name))) b.classList.add("is-bad");
        }
        choiceBox.appendChild(b);
      });
    }

    var listen = document.getElementById("pracListen");
    var stop = document.getElementById("pracStop");
    var submit = document.getElementById("pracSubmit");
    var next = document.getElementById("pracNext");
    var jamBtn = document.getElementById("pracJam");
    var upBtn = document.getElementById("pracLevelUp");
    var jamBar = document.getElementById("jamBar");
    listen.hidden = !(on && q && !state.jam && (q.kind === "keyFromChords" || q.kind === "keyFromMelody"));
    listen.textContent = q && q.kind === "keyFromMelody" ? "▶ 聽旋律" : "▶ 聽和弦進行";
    stop.hidden = !(on && transport.playing && !state.jam);
    submit.hidden = !(on && q && !state.jam && !state.grade);
    next.hidden = !(on && !state.jam);
    jamBtn.hidden = !(on && q && q.kind === "keyFromChords" && state.grade && state.grade.perfect && !state.jam);
    upBtn.hidden = !(on && state.pendingLevelUp && !state.jam);
    jamBar.hidden = !(on && state.jam);
    document.getElementById("tempoVal").textContent = String(transport.bpm || state.bpm);
    document.getElementById("tempoRange").value = String(state.bpm);

    var res = document.getElementById("pracResult");
    if (on && state.grade && !state.jam) {
      res.hidden = false;
      res.className = "shown";
      if (state.grade.perfect) res.textContent = "答對了！";
      else if (q && (q.kind === "keyFromChords" || q.kind === "keyFromMelody")) {
        res.textContent = "再聽一次看看。正確答案是" + P.keyLabel(q.answer.name, q.answer.quality) + "。";
      } else if (q && q.kind === "degreeChord") {
        res.textContent = "正確答案是 " + q.answer + "。";
      } else if (q && q.kind === "chordTones") {
        var bits = [];
        if (state.grade.missing.length) bits.push("漏了 " + state.grade.missing.length + " 個音");
        if (state.grade.extra.length) bits.push("多點了 " + state.grade.extra.length + " 個音");
        res.textContent = bits.join("，") + "。組成音是 " + q.chord.tones.join(" ") + "。";
      } else res.textContent = "再試一次。";
      if (state.pendingLevelUp) res.textContent += " 連對 " + state.streak + " 題，可以升到" + P.levelById(state.level + 1).name + "了！";
    } else {
      res.hidden = true;
      res.textContent = "";
      res.className = "";
    }
    paintCircle();
  }

  window.__notePracticeHit = function (pc) {
    if (state.mode !== "practice") return;
    if (C.unlock) C.unlock();
    if (state.jam) {
      var q = state.question;
      if (q && q.jam) {
        var sp = P.spellScale(q.jam.tonic, q.jam.quality);
        if (!sp.byPc[pc]) return false; // 只留自然音階
      }
      if (C.flash) C.flash(pc);
      C.playMidi(C.soundingMidi(pc));
      return false;
    }
    if (state.question && state.question.kind === "chordTones" && !state.grade) {
      if (state.picked[pc]) delete state.picked[pc];
      else state.picked[pc] = 1;
      if (C.flash) C.flash(pc);
      C.playMidi(C.soundingMidi(pc));
      renderPractice();
      return false;
    }
    // 其他題型：點音仍可聽，但不當答案
    if (C.flash) C.flash(pc);
    C.playMidi(C.soundingMidi(pc));
    return false;
  };

  function setMode(mode) {
    state.mode = mode;
    stopTransport();
    state.jam = false;
    if (mode === "browse") {
      state.question = null;
      state.grade = null;
      document.documentElement.classList.remove("practice-on", "practice-jam");
      C.render();
      renderPractice();
    } else {
      C.state.key = -1;
      C.state.chord = "";
      C.state.shown = null;
      if (!state.question) newQuestion();
      else { C.render(); renderPractice(); }
    }
  }

  function init() {
    fillLevels();
    document.getElementById("modeBtns").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-mode]");
      if (!b) return;
      setMode(b.getAttribute("data-mode"));
    });
    document.getElementById("pracLevelBtns").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-level]");
      if (!b) return;
      state.level = +b.getAttribute("data-level");
      state.streak = 0;
      state.pendingLevelUp = false;
      if (state.mode === "practice") newQuestion();
      else renderPractice();
    });
    document.getElementById("pracChoices").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-choice]");
      if (!b || !state.question || state.grade || state.jam) return;
      var name = b.getAttribute("data-choice");
      var q = state.question;
      if (q.kind === "degreeChord") state.choice = name;
      else {
        var ch = (q.choices || []).find(function (c) { return c.name === name; });
        state.choice = ch || { name: name, quality: q.quality };
      }
      renderPractice();
    });
    document.getElementById("pracListen").addEventListener("click", function () {
      var q = state.question;
      if (!q) return;
      if (q.kind === "keyFromChords") startProgression(q.chords, { bpm: 92, drums: true, loop: false, beatsPerChord: 2 });
      else if (q.kind === "keyFromMelody") playMelody(q);
    });
    document.getElementById("pracStop").addEventListener("click", function () { stopTransport(); });
    document.getElementById("pracSubmit").addEventListener("click", function () {
      var q = state.question;
      if (!q || state.grade) return;
      var ans;
      if (q.kind === "chordTones") ans = Object.keys(state.picked).map(Number);
      else ans = state.choice;
      if (q.kind !== "chordTones" && !ans) return;
      applyGrade(P.gradePracticeQuestion(ans, q));
      stopTransport();
      C.render();
      renderPractice();
    });
    document.getElementById("pracNext").addEventListener("click", function () { newQuestion(); });
    document.getElementById("pracJam").addEventListener("click", function () { enterJam(); });
    document.getElementById("pracLevelUp").addEventListener("click", function () {
      if (!state.pendingLevelUp) return;
      state.level += 1;
      state.streak = 0;
      state.pendingLevelUp = false;
      newQuestion();
    });
    document.getElementById("jamStop").addEventListener("click", function () { stopTransport(); });
    document.getElementById("tempoRange").addEventListener("input", function () {
      state.bpm = Math.max(60, Math.min(140, +this.value || 96));
      transport.bpm = state.bpm;
      document.getElementById("tempoVal").textContent = String(state.bpm);
    });

    var _render = C.render;
    C.render = function () {
      _render();
      if (state.mode === "practice") paintCircle();
    };
    renderPractice();
  }

  window.__notePractice = {
    state: state,
    newQuestion: newQuestion,
    setMode: setMode,
    enterJam: enterJam,
    startProgression: startProgression,
    stopTransport: stopTransport,
    playMelody: playMelody,
    renderPractice: renderPractice,
    applyGrade: applyGrade,
    isPlaying: function () { return !!transport.playing; }
  };

  init();
})();
