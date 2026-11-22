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
    jamKind: "",
    jamScale: "",
    bpm: 96,
    freejam: {
      tonic: "C",
      quality: "major",
      scale: "major",
      slots: [],
      rhythm: "8beat",
      bpm: 96,
      chordIndex: -1,
      jianpu: [],
      jpDur: "quarter",
      jpDotted: false,
      jpTitle: "",
      jpShowChords: true,
      jpPlayMelody: false,
      kbOn: false
    }
  };
  var kbHeld = {};

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

  function planSubdiv(plan) { return (plan && plan.subdiv) || 2; }
  function chordAtPlanStep(plan, step) {
    if (plan.chordBeats && plan.chordBeats.length && plan.chords && plan.chords.length) {
      var tagged = plan.chords.map(function (ch, i) {
        var o = { beats: plan.chordBeats[i] || 0 };
        for (var k in ch) if (Object.prototype.hasOwnProperty.call(ch, k)) o[k] = ch[k];
        return o;
      });
      return P.freeJamChordAtStep(tagged, plan.rhythm || "8beat", step);
    }
    var stepsPerChord = (plan.beatsPerChord || 2) * planSubdiv(plan);
    var n = Math.max(1, (plan.chords || []).length);
    var chordIdx = Math.floor(step / stepsPerChord) % n;
    return {
      index: (plan.chords && plan.chords.length) ? chordIdx : -1,
      chord: plan.chords && plan.chords[chordIdx],
      atAttack: !!(plan.chords && plan.chords.length && step % stepsPerChord === 0),
      localStep: stepsPerChord ? step % stepsPerChord : 0
    };
  }
  function totalPlanSteps(plan) {
    if (plan.chordBeats && plan.chordBeats.length) {
      var beats = plan.chordBeats.reduce(function (n, b) { return n + b; }, 0);
      return beats * planSubdiv(plan);
    }
    return (plan.chords || []).length * (plan.beatsPerChord || 2) * planSubdiv(plan);
  }
  function stepAdvance(plan, step) {
    if (plan.rhythm) return P.freeJamStepDurationBeats(plan.rhythm, step) * beatDur();
    return beatDur() / 2;
  }

  function scheduleStep(step, t, plan) {
    if (plan.drums !== false) {
      if (plan.rhythm) {
        var hits = P.freeJamDrumHits(plan.rhythm, step);
        if (hits.kick) playKick(t);
        if (hits.snare) playSnare(t);
        if (hits.hat) playHat(t, hits.open);
      } else {
        if (step % 8 === 0 || step % 8 === 4) playKick(t);
        if (step % 8 === 2 || step % 8 === 6) playSnare(t);
        playHat(t, step % 8 === 6);
      }
    }
    var at = chordAtPlanStep(plan, step);
    var chordIdx = at.index;
    if (plan.autoChords && at.chord && at.atAttack) {
      var midis = chordMidisFor(at.chord);
      if (C.playChord) C.playChord(midis, t, plan.playScore ? { keepMelody: true } : undefined);
    }
    if (plan.melodyMidis && plan.melodyMidis.length) {
      var mi = step % plan.melodyMidis.length;
      C.playMidi(plan.melodyMidis[mi], t);
      if (C.flash && plan.melodyPcs) C.flash(plan.melodyPcs[mi]);
    }
    if (plan.heldChord && at.atAttack) {
      if (C.playChord) C.playChord(chordMidisFor(plan.heldChord), t, { choke: false });
    }
    if (plan.onBeat) plan.onBeat(step, t, chordIdx, at);
    var notes = document.querySelectorAll("#circle .note");
    var glow = null;
    if (plan.heldChord) glow = plan.heldChord;
    else if (plan.autoChords && at.chord) glow = at.chord;
    if (glow) {
      notes.forEach(function (el) {
        var pc = +el.getAttribute("data-pc");
        el.classList.toggle("jam-now", glow.pcs.indexOf(pc) >= 0);
      });
    }
  }

  function tick() {
    var audio = ctx();
    if (!transport.playing || !audio) return;
    var horizon = audio.currentTime + 0.14;
    if (transport.scoreAt == null) transport.scoreAt = transport.loopStart || audio.currentTime;
    scheduleScoreNotes(transport.plan, transport.scoreAt, horizon);
    transport.scoreAt = horizon;
    while (transport.next < horizon) {
      scheduleStep(transport.step, transport.next, transport.plan);
      transport.next += stepAdvance(transport.plan, transport.step);
      transport.step += 1;
      if (!transport.loop) {
        var total = totalPlanSteps(transport.plan);
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
    var rhythm = opts.rhythm || "";
    var r = rhythm ? P.freeJamRhythmById(rhythm) : null;
    transport.plan = {
      kind: "chords",
      autoChords: true,
      chords: chords,
      beatsPerChord: opts.beatsPerChord || 2,
      chordBeats: opts.chordBeats || null,
      rhythm: rhythm || null,
      subdiv: r ? r.subdiv : 2,
      swing: !!(r && r.swing),
      drums: opts.drums !== false,
      onBeat: opts.onBeat || null,
      playScore: !!opts.playScore,
      scoreEvents: opts.scoreEvents || null,
      scoreLoopBeats: opts.scoreLoopBeats || 0
    };
    transport.step = 0;
    transport.next = ctx().currentTime + 0.06;
    transport.loopStart = transport.next;
    transport.scoreAt = transport.next;
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
    if (state.freejam) state.freejam.chordIndex = -1;
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
    state.jamKind = "";
    state.jamScale = "";
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

  function melodyMidisOf(pcs) {
    var base = 60, midis = [], last = base + pcs[0];
    midis.push(last);
    for (var i = 1; i < pcs.length; i++) {
      var m = base + pcs[i];
      while (m < last - 6) m += 12;
      while (m > last + 8) m -= 12;
      midis.push(m);
      last = m;
    }
    return midis;
  }

  function startMelodyJam(jam, opts) {
    opts = opts || {};
    if (C.unlock) C.unlock();
    ctx();
    if (ctx().state === "suspended") ctx().resume();
    stopTransport();
    transport.bpm = opts.bpm || state.bpm || 96;
    transport.loop = true;
    transport.plan = {
      kind: "melody",
      autoChords: false,
      drums: opts.drums !== false,
      beatsPerChord: 2,
      melodyPcs: (jam.pcs || []).slice(),
      melodyMidis: melodyMidisOf(jam.pcs || []),
      heldChord: null,
      jamChords: jam.chords || []
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

  function tapJamChord(ch) {
    if (!state.jam || !transport.plan) return;
    if (C.unlock) C.unlock();
    transport.plan.heldChord = ch;
    var audio = ctx();
    var t = Math.max(audio.currentTime + 0.02, transport.next);
    if (C.playChord) C.playChord(chordMidisFor(ch), t, { choke: false });
    document.querySelectorAll("#jamChords button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-chord") === ch.name);
    });
  }

  function jamContext() {
    if (state.mode === "freejam") {
      var f = state.freejam;
      return { tonic: f.tonic, quality: f.quality, scale: f.scale || P.defaultJamScale(f.quality) };
    }
    var q = state.question;
    if (state.mode === "practice" && state.jam && q && q.jam) {
      return { tonic: q.jam.tonic, quality: q.jam.quality, scale: state.jamScale || P.defaultJamScale(q.jam.quality) };
    }
    return null;
  }
  function currentJamSpell() {
    var ctxj = jamContext();
    if (!ctxj) return null;
    return P.spellJamScale(ctxj.tonic, ctxj.scale);
  }

  function setJamScale(id) {
    if (state.mode === "freejam") {
      if (!P.isJamScaleFor(id, state.freejam.quality)) return;
      if (state.freejam.scale === id) return;
      state.freejam.scale = id;
      renderPractice();
      return;
    }
    var q = state.question;
    if (!state.jam || !q || !q.jam) return;
    if (!P.isJamScaleFor(id, q.jam.quality)) return;
    if (state.jamScale === id) return;
    state.jamScale = id;
    renderPractice();
  }

  function resetLegend() {
    document.querySelectorAll("#legend li").forEach(function (li) {
      var sw = li.querySelector(".sw");
      if (li.querySelector(".sw-scale")) {
        li.textContent = "";
        if (sw) li.appendChild(sw);
        li.appendChild(document.createTextNode("這個調的自然音階"));
      } else if (li.querySelector(".sw-tonic")) {
        li.textContent = "";
        if (sw) li.appendChild(sw);
        li.appendChild(document.createTextNode("主音（1 / Do）"));
      }
    });
  }

  function fillScaleBox(box, quality, current, hidden) {
    if (!box) return;
    box.innerHTML = "";
    box.hidden = !!hidden;
    if (hidden) return;
    var lab = document.createElement("p");
    lab.className = "lab";
    lab.textContent = "音階";
    box.appendChild(lab);
    P.jamScalesFor(quality).forEach(function (sc) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-scale", sc.id);
      b.textContent = sc.short || sc.name;
      if (current === sc.id) b.classList.add("on");
      b.addEventListener("click", function () { setJamScale(sc.id); });
      box.appendChild(b);
    });
  }
  function fillJamScales() {
    var q = state.question;
    var on = state.mode === "practice" && state.jam && q && q.jam;
    fillScaleBox(document.getElementById("jamScales"), on ? q.jam.quality : "major", state.jamScale, !on);
  }
  function fillFreeJamScales() {
    var on = state.mode === "freejam";
    var f = state.freejam;
    fillScaleBox(document.getElementById("fjScales"), on ? f.quality : "major", f.scale, !on);
  }

  function enterJam() {
    var q = state.question;
    if (!q || !q.jam) return;
    state.jam = true;
    state.jamKind = q.jam.kind || (q.kind === "keyFromMelody" ? "melody" : "chords");
    state.jamScale = P.defaultJamScale(q.jam.quality);
    stopTransport();
    C.render();
    renderPractice();
    if (state.jamKind === "melody") startMelodyJam(q.jam, { bpm: state.bpm, drums: true });
    else startProgression(q.jam.chords, { bpm: state.bpm, drums: true, loop: true, beatsPerChord: 2 });
  }

  function fillJamChords(jam) {
    var box = document.getElementById("jamChords");
    if (!box) return;
    box.innerHTML = "";
    var isMel = state.jamKind === "melody";
    box.hidden = !isMel;
    if (!isMel || !jam || !jam.chords) return;
    jam.chords.forEach(function (ch) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-chord", ch.name);
      b.innerHTML = "<strong>" + ch.name + "</strong><span>" + (ch.shouLabel || "") + "</span>";
      if (transport.plan && transport.plan.heldChord && transport.plan.heldChord.name === ch.name) b.classList.add("on");
      b.addEventListener("click", function () { tapJamChord(ch); });
      box.appendChild(b);
    });
  }

  function currentGlowChord() {
    if (state.mode === "freejam") {
      var i = state.freejam.chordIndex;
      return i >= 0 ? state.freejam.slots[i] : null;
    }
    if (transport.plan) {
      if (transport.plan.heldChord) return transport.plan.heldChord;
      if (transport.playing && transport.plan.autoChords && transport.plan.chords) {
        return chordAtPlanStep(transport.plan, transport.step).chord;
      }
    }
    return null;
  }
  function paintKbOnNote(el, info) {
    var old = el.querySelector("text.kb");
    if (old) old.remove();
    if (state.mode !== "freejam" || !info) return;
    var body = el.querySelector("circle.body");
    if (!body) return;
    var kb = document.createElementNS("http://www.w3.org/2000/svg", "text");
    var ctxk = jamContext();
    var keys = ctxk ? P.freeJamKeysForPc(ctxk.tonic, ctxk.scale, +el.getAttribute("data-pc")) : { high:"", mid:"", low:"" };
    kb.setAttribute("class", "kb");
    kb.setAttribute("x", body.getAttribute("cx"));
    kb.setAttribute("y", String(+body.getAttribute("cy") + 24));
    kb.setAttribute("text-anchor", "middle");
    kb.setAttribute("dominant-baseline", "central");
    kb.textContent = [keys.high, keys.mid, keys.low].filter(Boolean).join(" ");
    el.appendChild(kb);
  }
  function paintCircle() {
    var root = document.documentElement;
    var notes = document.querySelectorAll("#circle .note");
    notes.forEach(function (el) {
      el.classList.remove("picked", "tone-ok", "tone-miss", "tone-bad", "jam-chord", "jam-chord-root");
      var kb = el.querySelector("text.kb");
      if (kb && state.mode !== "freejam") kb.remove();
    });
    var ctxj = jamContext();
    if (ctxj) {
      var sp = currentJamSpell();
      var glow = currentGlowChord();
      root.classList.add("has-key");
      notes.forEach(function (el) {
        var pc = +el.getAttribute("data-pc");
        var info = sp && sp.byPc[pc];
        el.classList.toggle("in", !!info);
        el.classList.toggle("out", !info);
        el.classList.toggle("tonic", !!(sp && pc === sp.tonicPc));
        var isChord = !!(glow && glow.pcs && glow.pcs.indexOf(pc) >= 0);
        el.classList.toggle("jam-chord", isChord);
        el.classList.toggle("jam-chord-root", !!(glow && glow.rootPc === pc));
        var degEl = el.querySelector("text.deg");
        if (degEl) degEl.textContent = info ? info.label : "";
        var nameEl = el.querySelector("text.name");
        if (nameEl && info) {
          while (nameEl.firstChild) nameEl.removeChild(nameEl.firstChild);
          nameEl.setAttribute("class", "name");
          nameEl.textContent = info.name;
          el.setAttribute("data-name", info.name);
        }
        paintKbOnNote(el, info);
      });
      var main = document.querySelector("#circle .center-main");
      var sub = document.querySelector("#circle .center-sub");
      if (main) main.textContent = P.keyLabel(ctxj.tonic, ctxj.quality);
      if (sub) {
        var tonicNum = ctxj.quality === "minor" ? "6" : "1";
        sub.textContent = (sp && sp.name ? sp.name + "　" : "") + "主音是 " + tonicNum;
      }
      document.querySelectorAll("#legend li").forEach(function (li) {
        var sw = li.querySelector(".sw");
        if (li.querySelector(".sw-scale") || (li.textContent.indexOf("音階") >= 0 && li.textContent.indexOf("主音") < 0)) {
          li.textContent = "";
          if (sw) li.appendChild(sw);
          li.appendChild(document.createTextNode(P.jamLegendText(ctxj.tonic, ctxj.scale)));
        } else if (li.querySelector(".sw-tonic") || li.textContent.indexOf("主音") >= 0) {
          li.textContent = "";
          if (sw) li.appendChild(sw);
          li.appendChild(document.createTextNode(ctxj.quality === "minor" ? "主音（6 / La）" : "主音（1 / Do）"));
        }
      });
      return;
    }
    resetLegend();
    if (state.mode !== "practice") return;
    var q = state.question;
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
    var fj = state.mode === "freejam";
    document.documentElement.classList.toggle("practice-on", on);
    document.documentElement.classList.toggle("practice-jam", (on && state.jam) || fj);
    document.documentElement.classList.toggle("freejam-on", fj);
    document.getElementById("pracBanner").hidden = !on;
    document.getElementById("pracBox").hidden = !on;
    var fjBox = document.getElementById("freeJamBox");
    if (fjBox) fjBox.hidden = !fj;
    var fjBan = document.getElementById("fjBanner");
    if (fjBan) fjBan.hidden = !fj;
    fillLevels();
    document.querySelectorAll("#modeBtns button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === state.mode);
    });
    if (fj) { renderFreeJam(); return; }
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
      if (state.jamKind === "melody") {
        hero.querySelector(".q-ask").textContent = "鼓點和旋律會一直循環。點下面的順階和弦，跟著一起彈；下面可以換音階，圓上只留下選中的音。";
      } else {
        hero.querySelector(".q-ask").textContent = "進行會一直循環。點音就能一起彈。下面可以換音階，圓上只留下選中的音。";
      }
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
    jamBtn.hidden = !(on && q && q.jam && state.grade && state.grade.perfect && !state.jam && (q.kind === "keyFromChords" || q.kind === "keyFromMelody"));
    upBtn.hidden = !(on && state.pendingLevelUp && !state.jam);
    jamBar.hidden = !(on && state.jam);
    document.getElementById("tempoVal").textContent = String(transport.bpm || state.bpm);
    document.getElementById("tempoRange").value = String(state.bpm);
    var cap = document.getElementById("jamCaption");
    if (on && state.jam && q && q.jam && state.jamKind === "chords") {
      cap.hidden = false;
      cap.textContent = (q.jam.chords || []).map(function (c) { return c.name + "（" + (c.shouLabel || "") + "）"; }).join("　");
    } else if (cap) {
      cap.hidden = true;
      cap.textContent = "";
    }
    fillJamChords(on && state.jam && q ? q.jam : null);
    fillJamScales();

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
    if (state.mode !== "practice" && state.mode !== "freejam") return;
    if (C.unlock) C.unlock();
    if (state.mode === "freejam" || state.jam) {
      var sp = currentJamSpell();
      if (!sp || !sp.byPc[pc]) return false; // 只留目前選中的音階
      if (C.flash) C.flash(pc);
      var inst = C.INSTRUMENTS[C.state.inst];
      var ctxj = jamContext();
      var midi = P.freeJamMidi(pc, P.pcOf(ctxj.tonic), C.state.octave, 0, inst && inst.octShift);
      if (C.playMidiImmediate && C.instBuffersReady && C.instBuffersReady()) C.playMidiImmediate(midi);
      else C.playMidi(midi);
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
    stopTransport();
    releaseAllKb();
    state.mode = mode;
    state.jam = false;
    state.jamKind = "";
    state.jamScale = "";
    if (mode === "browse") {
      state.question = null;
      state.grade = null;
      document.documentElement.classList.remove("practice-on", "practice-jam", "freejam-on");
      C.render();
      renderPractice();
    } else if (mode === "freejam") {
      state.question = null;
      state.grade = null;
      if (!P.isJamScaleFor(state.freejam.scale, state.freejam.quality)) {
        state.freejam.scale = P.defaultJamScale(state.freejam.quality);
      }
      C.state.key = -1;
      C.state.chord = "";
      C.state.shown = null;
      if (C.loadInst) C.loadInst(C.state.inst);
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


  function releaseAllKb() {
    Object.keys(kbHeld).forEach(function (k) { releaseFreeJamKey(k); });
    kbHeld = {};
  }
  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === "textarea" || el.isContentEditable) return true;
    if (tag === "input") {
      if (el.id === "fjKbInput") return false;
      var typ = (el.type || "text").toLowerCase();
      return typ !== "range" && typ !== "button" && typ !== "checkbox" && typ !== "radio" && typ !== "hidden";
    }
    return false;
  }
  function jamNoteMidi(pc, octShift) {
    var inst = C.INSTRUMENTS[C.state.inst];
    var ctxj = jamContext();
    var tonicPc = ctxj ? P.pcOf(ctxj.tonic) : 0;
    return P.freeJamMidi(pc, tonicPc, C.state.octave, octShift || 0, inst && inst.octShift);
  }
  function playFreeJamKey(letter, opts) {
    opts = opts || {};
    if (state.mode !== "freejam") return null;
    var f = state.freejam;
    var pitch = P.freeJamPitchForKey(f.tonic, f.scale, letter);
    if (!pitch) return null;
    if (C.unlock) C.unlock();
    var midi = jamNoteMidi(pitch.pc, pitch.oct);
    if (C.playMidiImmediate) C.playMidiImmediate(midi, { hold: !!opts.hold });
    else if (C.playMidi) C.playMidi(midi);
    if (C.flash) C.flash(pitch.pc);
    if (opts.record !== false) appendJianpu(pitch.label, pitch.oct, pitch.pc);
    return { pitch: pitch, midi: midi };
  }
  function releaseFreeJamKey(letter) {
    if (!C.releaseMidi) return;
    var f = state.freejam;
    var pitch = P.freeJamPitchForKey(f.tonic, f.scale, letter);
    if (!pitch) return;
    C.releaseMidi(jamNoteMidi(pitch.pc, pitch.oct));
  }
  function currentJpDur() { return state.freejam.jpDur || "quarter"; }
  function currentJpDotted() { return !!state.freejam.jpDotted; }
  function appendJianpu(label, oct, pc) {
    var f = state.freejam;
    f.jianpu = P.addJianpuNote(f.jianpu, label, oct, currentJpDur(), currentJpDotted(), pc);
    if (f.jianpu.length > 256) f.jianpu = f.jianpu.slice(-256);
    renderJianpu();
  }
  function appendJianpuRest() {
    state.freejam.jianpu = P.addJianpuRest(state.freejam.jianpu, currentJpDur(), currentJpDotted());
    renderJianpu();
  }
  function appendJianpuTie() {
    state.freejam.jianpu = P.addJianpuTie(state.freejam.jianpu, currentJpDur(), currentJpDotted());
    renderJianpu();
  }
  function backspaceJianpu() {
    state.freejam.jianpu = P.backspaceJianpu(state.freejam.jianpu);
    renderJianpu();
  }
  function clearJianpu() {
    state.freejam.jianpu = P.clearJianpuTokens();
    renderJianpu();
  }
  function currentScoreLayout() {
    var f = state.freejam;
    return P.jianpuLayout(f.jianpu, {
      meter: P.jianpuMeterBeats(f.rhythm),
      rhythmId: f.rhythm,
      tonic: f.tonic,
      quality: f.quality,
      bpm: f.bpm,
      title: f.jpTitle || "",
      showChords: !!f.jpShowChords,
      slots: f.slots
    });
  }
  function makeGlyphEl(g) {
    var s = document.createElement("span");
    s.className = "fj-glyph" + (g.type === "dash" ? " dash" : "") + (g.type === "rest" ? " rest" : "") + (g.tieStart ? " tie-end" : "");
    var hi = document.createElement("span");
    hi.className = "oct" + (g.oct > 0 ? " hi" : "");
    var sym = document.createElement("span");
    sym.className = "sym";
    if (g.acc) {
      var acc = document.createElement("span");
      acc.className = "acc";
      acc.textContent = g.acc;
      sym.appendChild(acc);
    }
    var num = document.createElement("span");
    num.className = "num";
    num.textContent = g.text;
    sym.appendChild(num);
    var lo = document.createElement("span");
    lo.className = "oct" + (g.oct < 0 ? " lo" : "");
    s.appendChild(hi);
    s.appendChild(sym);
    if (g.dotted) {
      var d = document.createElement("span");
      d.className = "durdot";
      s.appendChild(d);
    }
    s.appendChild(lo);
    return s;
  }
  function appendBeamed(parent, items, beam) {
    var wrap = document.createElement("span");
    var ul = beam.underlines || 1;
    wrap.className = "fj-beam ul" + (ul >= 2 ? "2" : "1");
    var dest = wrap;
    if (ul >= 2) {
      dest = document.createElement("span");
      dest.className = "fj-beam-inner";
      wrap.appendChild(dest);
    }
    beam.indices.forEach(function (i) { dest.appendChild(makeGlyphEl(items[i])); });
    parent.appendChild(wrap);
  }
  function renderJianpu() {
    var titleEl = document.getElementById("fjScoreTitle");
    var keyEl = document.getElementById("fjScoreKey");
    var meterEl = document.getElementById("fjScoreMeter");
    var tempoEl = document.getElementById("fjScoreTempo");
    var body = document.getElementById("fjScoreBody");
    if (!body) return;
    var layout = currentScoreLayout();
    if (titleEl) titleEl.textContent = layout.title || "";
    if (keyEl) keyEl.textContent = layout.keyMark;
    if (meterEl) meterEl.textContent = layout.meterLabel;
    if (tempoEl) tempoEl.textContent = "速度=" + layout.bpm;
    body.innerHTML = "";
    if (!layout.measures.length) {
      var empty = document.createElement("p");
      empty.className = "fj-score-empty";
      empty.textContent = "選好時值後，用鍵盤或上面的按鍵把旋律記下來。休止按 0，延長按 −。";
      body.appendChild(empty);
      return;
    }
    layout.measures.forEach(function (m) {
      var meas = document.createElement("div");
      meas.className = "fj-measure";
      var chords = document.createElement("div");
      chords.className = "fj-chords";
      (m.chords || []).forEach(function (c) {
        var ch = document.createElement("span");
        ch.className = "ch";
        ch.textContent = c.label;
        ch.style.left = Math.max(0, Math.min(85, (c.beat / (m.meter || 4)) * 100)) + "%";
        chords.appendChild(ch);
      });
      meas.appendChild(chords);
      var line = document.createElement("div");
      line.className = "fj-notes-line";
      var notes = document.createElement("div");
      notes.className = "fj-notes";
      var beamOf = {};
      (m.beams || []).forEach(function (b) {
        b.indices.forEach(function (i) { beamOf[i] = b; });
      });
      var i = 0;
      while (i < m.items.length) {
        var b = beamOf[i];
        if (b && b.indices[0] === i) {
          appendBeamed(notes, m.items, b);
          i = b.indices[b.indices.length - 1] + 1;
        } else {
          notes.appendChild(makeGlyphEl(m.items[i]));
          i += 1;
        }
      }
      var bar = document.createElement("span");
      bar.className = "fj-bar";
      bar.textContent = "|";
      line.appendChild(notes);
      line.appendChild(bar);
      meas.appendChild(line);
      body.appendChild(meas);
    });
  }
  function scheduleScoreNotes(plan, fromTime, toTime) {
    if (!plan || !plan.playScore || !plan.scoreEvents || !plan.scoreEvents.length) return;
    var beat = beatDur();
    var loopBeats = plan.scoreLoopBeats || 0;
    if (loopBeats <= 0 || beat <= 0) return;
    var t0 = transport.loopStart;
    var startRel = fromTime - t0;
    var endRel = toTime - t0;
    var loopDur = loopBeats * beat;
    if (loopDur <= 0) return;
    var firstCycle = Math.floor((startRel + 1e-9) / loopDur);
    var lastCycle = Math.floor((endRel - 1e-6) / loopDur);
    var c, j, ev, when;
    if (firstCycle < 0) firstCycle = 0;
    for (c = firstCycle; c <= lastCycle; c++) {
      for (j = 0; j < plan.scoreEvents.length; j++) {
        ev = plan.scoreEvents[j];
        if (ev.midi == null) continue;
        when = t0 + (c * loopBeats + ev.startBeat) * beat;
        if (when + 1e-6 >= fromTime && when < toTime) {
          if (C.playMidiImmediate) C.playMidiImmediate(ev.midi, { melody: true, when: when, chokeSame: true });
          else if (C.playMidi) C.playMidi(ev.midi, when);
          if (C.flash && ev.pc != null) C.flash(ev.pc);
        }
      }
    }
  }
  function scoreFileName() {
    var t = (state.freejam.jpTitle || "簡譜").replace(/[\\/:*?"<>|]+/g, "").trim();
    return (t || "簡譜") + ".jpg";
  }
  function drawJianpuCanvas(layout, canvas) {
    var cols = 4;
    var W = 1400;
    var pad = 72;
    var measureW = (W - pad * 2) / cols;
    var rowH = 200;
    var titleH = layout.title ? 80 : 24;
    var rows = Math.max(1, Math.ceil((layout.measures.length || 1) / cols));
    var H = pad + titleH + 56 + rows * rowH + pad;
    canvas.width = W;
    canvas.height = H;
    var ctxc = canvas.getContext("2d");
    ctxc.fillStyle = "#ffffff";
    ctxc.fillRect(0, 0, W, H);
    ctxc.fillStyle = "#111111";
    ctxc.textBaseline = "alphabetic";
    var y = pad + 10;
    if (layout.title) {
      ctxc.font = "800 42px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
      ctxc.textAlign = "center";
      ctxc.fillText(layout.title, W / 2, y + 36);
      y += titleH;
    } else {
      y += 16;
    }
    ctxc.textAlign = "left";
    ctxc.font = "700 28px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctxc.fillText(layout.keyMark, pad, y + 28);
    ctxc.fillText(layout.meterLabel, pad + 140, y + 28);
    ctxc.fillText("速度=" + layout.bpm, pad + 230, y + 28);
    y += 64;
    function drawGlyph(g, gx, gy) {
      ctxc.save();
      ctxc.textAlign = "center";
      if (g.oct > 0) {
        ctxc.beginPath();
        ctxc.arc(gx, gy - 44, 4, 0, Math.PI * 2);
        ctxc.fill();
      }
      var num = g.text;
      var accW = g.acc ? 14 : 0;
      if (g.acc) {
        ctxc.font = "700 20px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
        ctxc.fillText(g.acc, gx - 16, gy);
      }
      ctxc.font = (g.type === "dash" ? "700 32px " : "800 40px ") + "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
      ctxc.fillText(num, gx, gy);
      if (g.dotted) {
        ctxc.beginPath();
        ctxc.arc(gx + 18, gy - 4, 4, 0, Math.PI * 2);
        ctxc.fill();
      }
      if (g.oct < 0) {
        ctxc.beginPath();
        ctxc.arc(gx, gy + 14, 4, 0, Math.PI * 2);
        ctxc.fill();
      }
      if (g.tieStart) {
        ctxc.beginPath();
        ctxc.strokeStyle = "#111";
        ctxc.lineWidth = 2;
        ctxc.arc(gx - 16, gy - 28, 12, Math.PI * 1.1, Math.PI * 1.9);
        ctxc.stroke();
        ctxc.strokeStyle = "#111";
      }
      ctxc.restore();
    }
    layout.measures.forEach(function (m, mi) {
      var col = mi % cols;
      var row = Math.floor(mi / cols);
      var x0 = pad + col * measureW;
      var y0 = y + row * rowH + 8;
      var cx = x0;
      (m.chords || []).forEach(function (c, ci) {
        ctxc.font = "700 20px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
        ctxc.fillStyle = "#8a4b12";
        ctxc.textAlign = "left";
        ctxc.fillText(c.label, x0 + c.beat * ((measureW - 28) / m.meter) + 4, y0 + 18);
        ctxc.fillStyle = "#111";
      });
      var positions = [];
      m.items.forEach(function (g, gi) {
        var gw = Math.max(36, (g.beats || 0.5) * 36);
        var gx = x0 + 16 + g.startBeat * ((measureW - 36) / m.meter);
        positions.push({ x: gx, y: y0 + 78, w: gw, g: g });
        drawGlyph(g, gx, y0 + 78);
      });
      (m.beams || []).forEach(function (beam) {
        var first = positions[beam.indices[0]];
        var last = positions[beam.indices[beam.indices.length - 1]];
        if (!first || !last) return;
        var x1 = first.x - 12, x2 = last.x + 12, by = first.y + 16;
        ctxc.strokeStyle = "#111";
        ctxc.lineWidth = 3;
        ctxc.beginPath();
        ctxc.moveTo(x1, by);
        ctxc.lineTo(x2, by);
        ctxc.stroke();
        if (beam.underlines >= 2) {
          ctxc.beginPath();
          ctxc.moveTo(x1, by + 7);
          ctxc.lineTo(x2, by + 7);
          ctxc.stroke();
        }
      });
      ctxc.font = "400 36px serif";
      ctxc.textAlign = "left";
      ctxc.fillText("|", x0 + measureW - 20, y0 + 78);
    });
    return canvas;
  }
  function buildScoreCanvas() {
    var canvas = document.getElementById("fjScoreCanvas") || document.createElement("canvas");
    return drawJianpuCanvas(currentScoreLayout(), canvas);
  }
  function canvasToJpgBlob(canvas) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { resolve(b); }, "image/jpeg", 0.92);
      } else {
        var data = canvas.toDataURL("image/jpeg", 0.92);
        var bin = atob(data.split(",")[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: "image/jpeg" }));
      }
    });
  }
  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function exportJianpuJpg() {
    var canvas = buildScoreCanvas();
    return canvasToJpgBlob(canvas).then(function (blob) {
      downloadBlob(blob, scoreFileName());
      return blob;
    });
  }
  function shareJianpuJpg() {
    var canvas = buildScoreCanvas();
    var name = scoreFileName();
    return canvasToJpgBlob(canvas).then(function (blob) {
      var file = new File([blob], name, { type: "image/jpeg" });
      var payload = { files: [file], title: state.freejam.jpTitle || "簡譜", text: (state.freejam.jpTitle || "簡譜") };
      if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
        return navigator.share(payload).catch(function () { downloadBlob(blob, name); return blob; });
      }
      downloadBlob(blob, name);
      return blob;
    });
  }
  function printJianpu() {
    renderJianpu();
    window.print();
  }
  function scoreEventsForPlay() {
    var f = state.freejam;
    var inst = C.INSTRUMENTS[C.state.inst] || {};
    return P.jianpuPlaybackEvents(f.jianpu, {
      tonicPc: P.pcOf(f.tonic),
      octave: C.state.octave,
      instOctShift: inst.octShift || 0
    });
  }

  function setKbOn(on) {
    state.freejam.kbOn = !!on;
    var inp = document.getElementById("fjKbInput");
    var btn = document.getElementById("fjKbBtn");
    if (inp) inp.classList.toggle("kb-on", state.freejam.kbOn);
    if (btn) {
      btn.classList.toggle("on", state.freejam.kbOn);
      btn.textContent = state.freejam.kbOn ? "收起鍵盤" : "用鍵盤彈";
    }
    if (state.freejam.kbOn) {
      if (C.unlock) C.unlock();
      if (C.loadInst) C.loadInst(C.state.inst);
      if (inp) inp.focus();
    } else if (inp) {
      inp.blur();
    }
  }
  function onFjKeydown(e) {
    if (state.mode !== "freejam") return;
    if (e.repeat) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      backspaceJianpu();
      return;
    }
    if (e.key === "0") {
      e.preventDefault();
      appendJianpuRest();
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      appendJianpuTie();
      return;
    }
    var k = e.key && e.key.length === 1 ? e.key.toUpperCase() : "";
    if (!P.freeJamKeySpec(k)) return;
    e.preventDefault();
    if (kbHeld[k]) return;
    kbHeld[k] = true;
    playFreeJamKey(k, { hold: true, record: true });
  }
  function onFjKeyup(e) {
    var k = e.key && e.key.length === 1 ? e.key.toUpperCase() : "";
    if (!kbHeld[k]) return;
    delete kbHeld[k];
    releaseFreeJamKey(k);
  }
  function onFjSoftInput() {
    var inp = document.getElementById("fjKbInput");
    if (!inp || state.mode !== "freejam") return;
    var val = inp.value;
    inp.value = "";
    var i, k;
    for (i = 0; i < val.length; i++) {
      k = val.charAt(i).toUpperCase();
      if (kbHeld[k]) continue;
      playFreeJamKey(k, { hold: false, record: true });
    }
  }
  function setFreeJamKey(tonic, quality, restart) {
    var f = state.freejam;
    var q = quality || f.quality;
    var name = P.tonicInQuality(tonic || f.tonic, q);
    var playing = transport.playing && state.mode === "freejam";
    f.quality = q;
    f.tonic = name;
    if (!P.isJamScaleFor(f.scale, f.quality)) f.scale = P.defaultJamScale(f.quality);
    f.slots = P.retargetFreeJamSlots(f.slots, f.tonic, f.quality, f.rhythm);
    if (restart !== false && playing) startFreeJam();
    else renderPractice();
  }
  function addFreeJamDegree(degreeOrLabel) {
    var f = state.freejam;
    var before = f.slots.length;
    f.slots = P.addFreeJamSlot(f.slots, f.tonic, f.quality, degreeOrLabel, null, f.rhythm);
    if (f.slots.length === before) return;
    if (transport.playing && state.mode === "freejam") startFreeJam();
    else renderPractice();
  }
  function removeFreeJamAt(index) {
    var f = state.freejam;
    f.slots = P.removeFreeJamSlot(f.slots, index);
    if (transport.playing && state.mode === "freejam") {
      if (!f.slots.length) stopTransport();
      else startFreeJam();
    } else renderPractice();
  }
  function clearFreeJamSlots() {
    state.freejam.slots = [];
    if (transport.playing && state.mode === "freejam") stopTransport();
    else renderPractice();
  }
  function cycleSlotBeats(index) {
    var f = state.freejam;
    var s = f.slots[index];
    if (!s) return;
    f.slots = P.setFreeJamSlotBeats(f.slots, index, P.cycleFreeJamBeats(f.rhythm, s.beats), f.rhythm);
    if (transport.playing && state.mode === "freejam") startFreeJam();
    else renderPractice();
  }
  function setFreeJamRhythm(id) {
    var f = state.freejam;
    var playing = transport.playing && state.mode === "freejam";
    f.rhythm = (P.freeJamRhythmById(id) || P.FREE_JAM_RHYTHMS[0]).id;
    f.slots = P.retargetFreeJamSlots(f.slots, f.tonic, f.quality, f.rhythm);
    if (playing) startFreeJam();
    else renderPractice();
  }
  function startFreeJam() {
    var f = state.freejam;
    if (!f.slots.length) return;
    if (C.unlock) C.unlock();
    var score = scoreEventsForPlay();
    startProgression(f.slots, {
      bpm: f.bpm,
      drums: true,
      loop: true,
      rhythm: f.rhythm,
      chordBeats: f.slots.map(function (s) { return s.beats; }),
      playScore: !!(f.jpPlayMelody && score.events.length),
      scoreEvents: score.events,
      scoreLoopBeats: Math.max(score.totalBeats, P.freeJamTotalBeats(f.slots) || 0, 1),
      onBeat: function (step, t, idx) {
        if (state.mode !== "freejam") return;
        var changed = state.freejam.chordIndex !== idx;
        state.freejam.chordIndex = idx;
        document.querySelectorAll("#fjProg .slot").forEach(function (el, i) {
          el.classList.toggle("now", i === idx);
        });
        if (changed) paintCircle();
      }
    });
    f.chordIndex = 0;
    document.querySelectorAll("#fjProg .slot").forEach(function (el, i) {
      el.classList.toggle("now", i === 0);
    });
    paintCircle();
  }
  function fillFreeJamTonics() {
    var box = document.getElementById("fjTonics");
    if (!box) return;
    box.innerHTML = "";
    var f = state.freejam;
    var list = f.quality === "minor" ? P.MINOR_KEYS : P.MAJOR_KEYS;
    list.forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-tonic", name);
      b.setAttribute("role", "radio");
      b.textContent = name;
      if (name === f.tonic) b.classList.add("on");
      box.appendChild(b);
    });
  }
  function fillFreeJamDegrees() {
    var box = document.getElementById("fjDegrees");
    if (!box) return;
    box.innerHTML = "";
    var f = state.freejam;
    var chords = P.diatonicChords(f.tonic, f.quality);
    chords.forEach(function (ch) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-degree", String(ch.degree));
      b.innerHTML = "<strong>" + ch.shouLabel + "</strong><span>(" + ch.name + ")</span>";
      box.appendChild(b);
    });
  }
  function fillFreeJamProg() {
    var box = document.getElementById("fjProg");
    if (!box) return;
    box.innerHTML = "";
    var f = state.freejam;
    f.slots.forEach(function (s, i) {
      var row = document.createElement("div");
      row.className = "slot" + (transport.playing && f.chordIndex === i ? " now" : "");
      row.setAttribute("data-index", String(i));
      var nm = document.createElement("div");
      nm.className = "nm";
      nm.textContent = s.label;
      var beat = document.createElement("button");
      beat.type = "button";
      beat.className = "beats";
      beat.setAttribute("data-beats-of", String(i));
      beat.textContent = s.beats + " 拍";
      var del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.setAttribute("data-del", String(i));
      del.setAttribute("aria-label", "刪除");
      del.textContent = "刪除";
      row.appendChild(nm);
      row.appendChild(beat);
      row.appendChild(del);
      box.appendChild(row);
    });
  }
  function fillFreeJamRhythms() {
    var box = document.getElementById("fjRhythms");
    if (!box || box.getAttribute("data-ready")) {
      if (box) box.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-rhythm") === state.freejam.rhythm);
      });
      return;
    }
    P.FREE_JAM_RHYTHMS.forEach(function (r) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-rhythm", r.id);
      b.setAttribute("role", "radio");
      b.textContent = r.name;
      if (r.id === state.freejam.rhythm) b.classList.add("on");
      box.appendChild(b);
    });
    box.setAttribute("data-ready", "1");
  }
  function fillKbGuide() {
    var f = state.freejam;
    ["high", "mid", "low"].forEach(function (row) {
      var el = document.querySelector('#fjKbGuide .fj-kb-row[data-row="' + row + '"]');
      if (!el) return;
      el.querySelectorAll(".fj-kb-key").forEach(function (n) { n.remove(); });
      (P.FREE_JAM_KEY_ROWS[row] || []).forEach(function (ch, i) {
        var deg = String(i + 1);
        var pitch = P.freeJamPitchForKey(f.tonic, f.scale, ch);
        var b = document.createElement("button");
        b.type = "button";
        b.className = "fj-kb-key" + (pitch ? "" : " off");
        b.setAttribute("data-key", ch);
        if (!pitch) b.disabled = true;
        b.innerHTML = "<span class=\"ch\">" + ch + "</span><span class=\"deg\">" + (pitch ? pitch.label : deg) + "</span>";
        if (pitch) {
          b.addEventListener("pointerdown", function (ev) {
            ev.preventDefault();
            playFreeJamKey(ch, { hold: true, record: true });
          });
          b.addEventListener("pointerup", function () { releaseFreeJamKey(ch); });
          b.addEventListener("pointercancel", function () { releaseFreeJamKey(ch); });
        }
        el.appendChild(b);
      });
    });
  }
  function renderFreeJam() {
    var f = state.freejam;
    document.querySelectorAll("#fjQuality button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-quality") === f.quality);
    });
    fillFreeJamTonics();
    fillFreeJamDegrees();
    fillFreeJamProg();
    fillFreeJamRhythms();
    fillFreeJamScales();
    fillKbGuide();
    renderJianpu();
    document.querySelectorAll("#fjJpDurs button[data-dur]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-dur") === (f.jpDur || "quarter"));
    });
    var dotBtn = document.getElementById("fjJpDot");
    if (dotBtn) dotBtn.classList.toggle("on", !!f.jpDotted);
    var titleIn = document.getElementById("fjJpTitle");
    if (titleIn && document.activeElement !== titleIn) titleIn.value = f.jpTitle || "";
    var chb = document.getElementById("fjJpChords");
    if (chb) chb.checked = !!f.jpShowChords;
    var pmb = document.getElementById("fjJpPlayMel");
    if (pmb) pmb.checked = !!f.jpPlayMelody;
    var play = document.getElementById("fjPlay");
    var stop = document.getElementById("fjStop");
    if (play) {
      play.disabled = !f.slots.length;
      play.classList.toggle("on", !!transport.playing);
      play.textContent = transport.playing ? "▶ 播放中" : "▶ 播放";
    }
    if (stop) stop.disabled = !transport.playing;
    var tv = document.getElementById("fjTempoVal");
    var tr = document.getElementById("fjTempoRange");
    if (tv) tv.textContent = String(f.bpm);
    if (tr) tr.value = String(f.bpm);
    var hint = document.getElementById("fjDegHint");
    if (hint) {
      hint.textContent = f.slots.length >= P.FREE_JAM_MAX
        ? "已經有 16 個和弦了，先刪掉或清空再加。"
        : "最多 16 個和弦。點一下加到進行裡。每個和弦可改拍數。";
    }
    var btn = document.getElementById("fjKbBtn");
    if (btn) {
      btn.classList.toggle("on", f.kbOn);
      btn.textContent = f.kbOn ? "收起鍵盤" : "用鍵盤彈";
    }
    var inp = document.getElementById("fjKbInput");
    if (inp) inp.classList.toggle("kb-on", f.kbOn);
    var ban = document.getElementById("fjBanner");
    if (ban) {
      var title = ban.querySelector(".q-title");
      var ask = ban.querySelector(".q-ask");
      if (title) title.textContent = P.keyLabel(f.tonic, f.quality);
      if (ask) {
        if (transport.playing && f.chordIndex >= 0 && f.slots[f.chordIndex]) {
          ask.textContent = "現在是 " + f.slots[f.chordIndex].label + "。用圓上的音或鍵盤即興。";
        } else if (!f.slots.length) {
          ask.textContent = "先選調，點級數排出和弦，按播放後就可以在圓上即興。";
        } else {
          ask.textContent = "進行已排好，按播放就會循環。圓上只留下目前音階，也可用鍵盤彈。";
        }
      }
    }
    paintCircle();
  }
  function bindFreeJam() {
    var qbox = document.getElementById("fjQuality");
    if (qbox) qbox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-quality]");
      if (!b) return;
      setFreeJamKey(state.freejam.tonic, b.getAttribute("data-quality"));
    });
    var tbox = document.getElementById("fjTonics");
    if (tbox) tbox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-tonic]");
      if (!b) return;
      setFreeJamKey(b.getAttribute("data-tonic"), state.freejam.quality);
    });
    var dbox = document.getElementById("fjDegrees");
    if (dbox) dbox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-degree]");
      if (!b) return;
      addFreeJamDegree(+b.getAttribute("data-degree"));
    });
    var pbox = document.getElementById("fjProg");
    if (pbox) pbox.addEventListener("click", function (e) {
      var del = e.target.closest("button[data-del]");
      if (del) { removeFreeJamAt(+del.getAttribute("data-del")); return; }
      var beat = e.target.closest("button[data-beats-of]");
      if (beat) cycleSlotBeats(+beat.getAttribute("data-beats-of"));
    });
    var clr = document.getElementById("fjClear");
    if (clr) clr.addEventListener("click", function () { clearFreeJamSlots(); });
    var rbox = document.getElementById("fjRhythms");
    if (rbox) rbox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-rhythm]");
      if (!b) return;
      setFreeJamRhythm(b.getAttribute("data-rhythm"));
    });
    var play = document.getElementById("fjPlay");
    if (play) play.addEventListener("click", function () {
      if (!state.freejam.slots.length) return;
      if (transport.playing) { stopTransport(); return; }
      startFreeJam();
    });
    var stop = document.getElementById("fjStop");
    if (stop) stop.addEventListener("click", function () { stopTransport(); });
    var tempo = document.getElementById("fjTempoRange");
    if (tempo) tempo.addEventListener("input", function () {
      state.freejam.bpm = Math.max(60, Math.min(160, +this.value || 96));
      transport.bpm = state.freejam.bpm;
      var tv = document.getElementById("fjTempoVal");
      if (tv) tv.textContent = String(state.freejam.bpm);
    });
    var kbBtn = document.getElementById("fjKbBtn");
    if (kbBtn) kbBtn.addEventListener("click", function () { setKbOn(!state.freejam.kbOn); });
    var inp = document.getElementById("fjKbInput");
    if (inp) {
      inp.addEventListener("compositionstart", function () { inp.setAttribute("data-composing", "1"); });
      inp.addEventListener("compositionend", function () {
        inp.setAttribute("data-composing", "0");
        onFjSoftInput();
      });
      inp.addEventListener("input", function (e) {
        if (e.isComposing || inp.getAttribute("data-composing") === "1") return;
        onFjSoftInput();
      });
      inp.addEventListener("blur", function () {
        setTimeout(function () {
          if (document.activeElement === inp) return;
          if (state.freejam.kbOn) setKbOn(false);
        }, 300);
      });
    }
    var durs = document.getElementById("fjJpDurs");
    if (durs) durs.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-dur]");
      if (!b) return;
      state.freejam.jpDur = b.getAttribute("data-dur");
      renderFreeJam();
    });
    var dotBtn = document.getElementById("fjJpDot");
    if (dotBtn) dotBtn.addEventListener("click", function () {
      state.freejam.jpDotted = !state.freejam.jpDotted;
      renderFreeJam();
    });
    var rest = document.getElementById("fjJpRest");
    if (rest) rest.addEventListener("click", function () { appendJianpuRest(); });
    var tie = document.getElementById("fjJpTie");
    if (tie) tie.addEventListener("click", function () { appendJianpuTie(); });
    var back = document.getElementById("fjJpBack");
    if (back) back.addEventListener("click", function () { backspaceJianpu(); });
    var jpClr = document.getElementById("fjJpClear");
    if (jpClr) jpClr.addEventListener("click", function () { clearJianpu(); });
    var titleIn = document.getElementById("fjJpTitle");
    if (titleIn) titleIn.addEventListener("input", function () {
      state.freejam.jpTitle = titleIn.value;
      var el = document.getElementById("fjScoreTitle");
      if (el) el.textContent = titleIn.value;
    });
    var chb = document.getElementById("fjJpChords");
    if (chb) chb.addEventListener("change", function () {
      state.freejam.jpShowChords = !!chb.checked;
      renderJianpu();
    });
    var pmb = document.getElementById("fjJpPlayMel");
    if (pmb) pmb.addEventListener("change", function () {
      state.freejam.jpPlayMelody = !!pmb.checked;
      if (transport.playing && state.mode === "freejam" && state.freejam.slots.length) startFreeJam();
    });
    var jpg = document.getElementById("fjJpJpg");
    if (jpg) jpg.addEventListener("click", function () { exportJianpuJpg(); });
    var shr = document.getElementById("fjJpShare");
    if (shr) shr.addEventListener("click", function () { shareJianpuJpg(); });
    var prn = document.getElementById("fjJpPrint");
    if (prn) prn.addEventListener("click", function () { printJianpu(); });
    var tempo = document.getElementById("fjTempoRange");
    if (tempo) tempo.addEventListener("input", function () { renderJianpu(); });
    window.addEventListener("keydown", onFjKeydown);
    window.addEventListener("keyup", onFjKeyup);
    window.addEventListener("blur", releaseAllKb);
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
      if (state.mode === "practice" || state.mode === "freejam") paintCircle();
    };
    bindFreeJam();
    renderPractice();
  }

  window.__notePractice = {
    state: state,
    newQuestion: newQuestion,
    setMode: setMode,
    enterJam: enterJam, setJamScale: setJamScale, tapJamChord: tapJamChord, startMelodyJam: startMelodyJam,
    startProgression: startProgression,
    stopTransport: stopTransport,
    playMelody: playMelody,
    renderPractice: renderPractice,
    applyGrade: applyGrade,
    isPlaying: function () { return !!transport.playing; },
    setFreeJamKey: setFreeJamKey,
    addFreeJamDegree: addFreeJamDegree,
    setFreeJamRhythm: setFreeJamRhythm,
    startFreeJam: startFreeJam,
    playFreeJamKey: playFreeJamKey,
    setKbOn: setKbOn,
    currentGlowChord: currentGlowChord,
    appendJianpu: appendJianpu, appendJianpuRest: appendJianpuRest, appendJianpuTie: appendJianpuTie,
    backspaceJianpu: backspaceJianpu, clearJianpu: clearJianpu,
    currentScoreLayout: currentScoreLayout, renderJianpu: renderJianpu,
    exportJianpuJpg: exportJianpuJpg, shareJianpuJpg: shareJianpuJpg,
    buildScoreCanvas: buildScoreCanvas, scoreEventsForPlay: scoreEventsForPlay
  };

  init();
})();
