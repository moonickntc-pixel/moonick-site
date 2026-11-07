// Synthesized drum kit and a look-ahead scheduler. No samples.

export function createKit() {
  let ctx = null;
  let master = null;
  let noise = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function gain(at, peak, attack, decay) {
    const node = ctx.createGain();
    const p = Math.max(0.0001, peak);
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(p, at + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    node.connect(master);
    return node;
  }

  function osc(type, freq, at, dur, peak) {
    const node = ctx.createOscillator();
    node.type = type;
    node.frequency.setValueAtTime(freq, at);
    const g = gain(at, peak, 0.004, dur);
    node.connect(g);
    node.start(at);
    node.stop(at + dur + 0.05);
    return node;
  }

  function burst(filterType, freq, q, at, dur, peak) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = gain(at, peak, 0.002, dur);
    src.connect(filter);
    filter.connect(g);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  function play(inst, vel = 100, when = 0) {
    const at = Math.max(ensure().currentTime, when);
    const v = Math.max(0.05, Math.min(1, vel / 127));
    switch (inst) {
      case "kick": {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(165, at);
        o.frequency.exponentialRampToValueAtTime(46, at + 0.09);
        const g = gain(at, 0.95 * v, 0.004, 0.24);
        o.connect(g);
        o.start(at);
        o.stop(at + 0.3);
        burst("highpass", 1200, 0.4, at, 0.012, 0.25 * v);
        break;
      }
      case "snare":
        burst("bandpass", 1800, 0.7, at, 0.14, 0.55 * v);
        osc("triangle", 196, at, 0.09, 0.35 * v);
        break;
      case "xstick":
        burst("highpass", 4500, 0.8, at, 0.03, 0.35 * v);
        osc("square", 980, at, 0.025, 0.12 * v);
        break;
      case "tom1":
      case "tom2":
      case "tom3": {
        const start = inst === "tom1" ? 220 : inst === "tom2" ? 156 : 90;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(start, at);
        o.frequency.exponentialRampToValueAtTime(start * 0.55, at + 0.18);
        const g = gain(at, 0.7 * v, 0.004, 0.28);
        o.connect(g);
        o.start(at);
        o.stop(at + 0.34);
        break;
      }
      case "hat":
        burst("highpass", 7500, 0.7, at, 0.045, 0.28 * v);
        break;
      case "hatOpen":
        burst("highpass", 6800, 0.6, at, 0.38, 0.26 * v);
        break;
      case "foot":
        burst("bandpass", 420, 1.2, at, 0.04, 0.35 * v);
        break;
      case "ride":
        osc("sine", 440, at, 0.32, 0.08 * v);
        osc("triangle", 820, at, 0.22, 0.05 * v);
        burst("bandpass", 3200, 1.4, at, 0.18, 0.12 * v);
        break;
      case "rideBell":
        osc("triangle", 988, at, 0.22, 0.1 * v);
        osc("sine", 1480, at, 0.16, 0.06 * v);
        break;
      case "crash":
        burst("highpass", 4800, 0.4, at, 0.85, 0.32 * v);
        osc("triangle", 310, at, 0.4, 0.05 * v);
        break;
      case "stack":
        burst("highpass", 5200, 0.8, at, 0.22, 0.28 * v);
        osc("square", 740, at, 0.08, 0.04 * v);
        break;
      case "cow":
        osc("square", 587, at, 0.18, 0.12 * v);
        osc("square", 845, at, 0.16, 0.08 * v);
        break;
      case "click":
        osc("square", 1760, at, 0.035, 0.18 * v);
        break;
      case "clickSoft":
        osc("square", 1240, at, 0.03, 0.1 * v);
        break;
      default:
        osc("sine", 440, at, 0.05, 0.1 * v);
    }
  }

  return {
    ensure,
    play,
    get context() {
      return ctx;
    },
  };
}

export function createTransport(kit) {
  let timer = null;
  let playing = false;
  let loop = true;
  let frame = () => {};
  let loopStart = 0;
  let loopDur = 0;
  let countIn = 0;
  let slotTimes = [];

  function stop() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    frame({ playing: false, slot: -1 });
  }

  function start(buildLoop) {
    const ctx = kit.ensure();
    stop();
    playing = true;
    let scheduledUntil = ctx.currentTime + 0.06;
    let first = true;
    const speedStarted = ctx.currentTime;

    const pump = () => {
      if (!playing) return;
      const now = ctx.currentTime;
      if (!first && now + 0.3 < scheduledUntil) return;
      if (!first && !loop) {
        if (now >= scheduledUntil - 0.04) stop();
        return;
      }
      const plan = buildLoop({
        first,
        elapsed: now - speedStarted,
      });
      first = false;
      loopStart = scheduledUntil;
      loopDur = plan.duration;
      countIn = plan.countIn || 0;
      slotTimes = plan.slotTimes || [];
      for (const hit of plan.hits) kit.play(hit.inst, hit.vel, scheduledUntil + hit.time);
      scheduledUntil += Math.max(0.05, plan.duration);
    };

    pump();
    timer = setInterval(() => {
      if (!playing) return;
      const now = kit.context.currentTime;
      const local = now - loopStart;
      let slot = -1;
      if (local >= countIn) {
        for (let i = slotTimes.length - 1; i >= 0; i--) {
          if (local >= slotTimes[i] - 0.02) {
            slot = i;
            break;
          }
        }
      }
      frame({ playing: true, slot, local, countIn });
      pump();
    }, 40);
  }

  return {
    start,
    stop,
    toggle(buildLoop) {
      if (playing) stop();
      else start(buildLoop);
    },
    get playing() {
      return playing;
    },
    get looping() {
      return loop;
    },
    set looping(value) {
      loop = value;
    },
    onFrame(fn) {
      frame = fn;
    },
  };
}
