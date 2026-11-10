import assert from "node:assert/strict";
import test from "node:test";
import { createClapDetector } from "./clap-dsp.js";

const RATE = 48000;
const BLOCK = 128;

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeBuffer(seconds) {
  return new Float32Array(Math.floor(seconds * RATE));
}

function addBurst(buffer, atSecond, seconds, amplitude, random, highpass) {
  const start = Math.floor(atSecond * RATE);
  const count = Math.floor(seconds * RATE);
  let prev = 0;
  for (let i = 0; i < count; i += 1) {
    const index = start + i;
    if (index < 0 || index >= buffer.length) continue;
    const env = Math.exp(-i / (0.0032 * RATE));
    const noise = random() * 2 - 1;
    const sample = highpass ? noise - prev : noise;
    prev = noise;
    buffer[index] += amplitude * env * sample;
  }
}

function delayGain(buffer, delaySeconds, gain) {
  const out = new Float32Array(buffer.length);
  const delay = Math.round(delaySeconds * RATE);
  for (let i = 0; i < buffer.length; i += 1) {
    const source = i - delay;
    if (source >= 0) out[i] += gain * buffer[source];
  }
  return out;
}

function addNoise(buffer, amplitude, random) {
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] += amplitude * (random() * 2 - 1);
  }
}

function mix(into, other) {
  for (let i = 0; i < into.length; i += 1) into[i] += other[i] || 0;
}

function legacyCount(mic, sensitivity) {
  let noise = 0.004;
  let prev = 0;
  let cooldown = 0;
  let count = 0;
  const sens = sensitivity;
  const minRms = 0.06 - sens * 0.008;
  const ratio = 6.4 - sens * 0.7;
  const zcrMin = 0.12 - sens * 0.012;
  for (let offset = 0; offset < mic.length; offset += BLOCK) {
    const length = Math.min(BLOCK, mic.length - offset);
    let energy = 0;
    let crossings = 0;
    for (let i = 0; i < length; i += 1) {
      const sample = mic[offset + i];
      const delta = sample - prev;
      energy += delta * delta;
      if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) crossings += 1;
      prev = sample;
    }
    const rms = Math.sqrt(energy / length);
    const zcr = crossings / length;
    if (rms < noise * 3) noise = noise * 0.97 + rms * 0.03;
    else noise = noise * 0.998 + rms * 0.002;
    const threshold = Math.max(minRms, noise * ratio);
    cooldown -= length / RATE;
    if (cooldown <= 0 && rms > threshold && zcr > zcrMin) {
      cooldown = 0.07;
      count += 1;
    }
  }
  return count;
}

function runDetector(ref, mic, sensitivity) {
  const detector = createClapDetector(RATE);
  detector.setSensitivity(sensitivity);
  detector.startCalibration();
  const times = [];
  let calibration = null;
  let samples = 0;
  for (let offset = 0; offset < ref.length; offset += BLOCK) {
    const length = Math.min(BLOCK, ref.length - offset);
    const refBlock = ref.subarray(offset, offset + length);
    const micBlock = mic.subarray(offset, offset + length);
    const result = detector.push(refBlock && micBlock ? micBlock : micBlock, refBlock);
    samples += length;
    if (result.calibration) calibration = result.calibration;
    if (result.onset) times.push(samples / RATE);
  }
  return { times, calibration, snapshot: detector.snapshot() };
}

function calibrationSignal(seconds) {
  const random = rng(7);
  const ref = makeBuffer(seconds);
  for (let i = 0; i < 4; i += 1) {
    addBurst(ref, 0.08 + i * 0.09, 0.016, 0.62, random, true);
  }
  return ref;
}

function countNear(times, targets, windowSeconds) {
  const used = new Set();
  let hits = 0;
  for (const target of targets) {
    let best = -1;
    let bestGap = windowSeconds;
    times.forEach((time, index) => {
      if (used.has(index)) return;
      const gap = Math.abs(time - target);
      if (gap <= bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    if (best >= 0) {
      used.add(best);
      hits += 1;
    }
  }
  return { hits, extras: times.length - hits };
}

export function scenario({ clapAmp, bleedGain, delay, clapsOnBeat, sensitivity, reflect }) {
  const random = rng(11);
  const clapRandom = rng(29);
  const seconds = 0.55 + 4.4;
  const ref = makeBuffer(seconds);
  mix(ref, calibrationSignal(0.55));
  const beat0 = 0.7;
  const period = 0.5;
  const beats = [];
  for (let i = 0; i < 8; i += 1) {
    const at = beat0 + i * period;
    beats.push(at);
    addBurst(ref, at, 0.02, 0.85, random, true);
  }
  let mic = delayGain(ref, delay, bleedGain);
  if (reflect) mic = mixInto(mic, delayGain(ref, delay + 0.011, bleedGain * 0.45));
  const clapTimes = [];
  for (let i = 0; i < 8; i += 1) {
    const at = beats[i] + (clapsOnBeat ? delay : period * 0.5);
    if (clapAmp > 0) {
      addBurst(mic, at, 0.01, clapAmp, clapRandom, true);
      clapTimes.push(at);
    }
  }
  addNoise(mic, 0.0015, rng(3));
  const musicOnly = delayGain(ref, delay, bleedGain);
  addNoise(musicOnly, 0.0015, rng(3));
  const detected = runDetector(ref, mic, sensitivity);
  const afterCal = detected.times.filter((time) => time > 0.6);
  const matched = countNear(afterCal, clapTimes.map((time) => time), 0.08);
  return {
    legacyMusic: legacyCount(musicOnly.subarray(Math.floor(0.6 * RATE)), sensitivity),
    legacyBoth: legacyCount(mic.subarray(Math.floor(0.6 * RATE)), sensitivity),
    detected: afterCal.length,
    hits: matched.hits,
    extras: matched.extras,
    expected: clapTimes.length,
    calibration: detected.calibration,
    delay,
    bleedGain,
  };
}

function mixInto(into, other) {
  mix(into, other);
  return into;
}

test("只有喇叭、沒有拍手時，不會把鼓聲算成拍手", () => {
  const result = scenario({
    clapAmp: 0,
    bleedGain: 0.34,
    delay: 0.064,
    clapsOnBeat: true,
    sensitivity: 1,
  });
  assert.ok(result.calibration?.ok, "測試聲要對得到喇叭");
  assert.ok(result.legacyMusic >= 6, `舊偵測應會把鼓聲算進去，實際 ${result.legacyMusic}`);
  assert.equal(result.detected, 0);
});

test("沒有音樂時，靈敏度 1 數得出八下拍手", () => {
  const result = scenario({
    clapAmp: 0.42,
    bleedGain: 0,
    delay: 0.04,
    clapsOnBeat: false,
    sensitivity: 1,
  });
  assert.equal(result.hits, result.expected);
  assert.equal(result.extras, 0);
});

test("音樂播放中照拍子拍手，計數接近實際拍數", () => {
  const result = scenario({
    clapAmp: 0.42,
    bleedGain: 0.34,
    delay: 0.072,
    clapsOnBeat: true,
    sensitivity: 1,
    reflect: true,
  });
  assert.ok(result.calibration?.ok);
  console.log(
    `照拍子：舊偵測純音樂 ${result.legacyMusic} 下，新偵測對上 ${result.hits}/${result.expected}，多算 ${result.extras}，延遲 ${result.calibration.delaySeconds.toFixed(3)} 秒，增益 ${result.calibration.gain.toFixed(3)}`,
  );
  const delayError = Math.abs(result.calibration.delaySeconds - result.delay);
  assert.ok(delayError < 0.003, `延遲誤差 ${delayError}`);
  const gainError = Math.abs(result.calibration.gain - result.bleedGain) / result.bleedGain;
  assert.ok(gainError < 0.25, `增益誤差 ${gainError}`);
  assert.ok(result.legacyMusic >= 6, `舊偵測在純音樂時數到 ${result.legacyMusic}`);
  assert.ok(
    Math.abs(result.hits - result.expected) <= 1,
    `對上 ${result.hits}/${result.expected}，多算 ${result.extras}，總偵測 ${result.detected}`,
  );
  assert.ok(result.extras <= 1, `多算了 ${result.extras} 下`);
});

test("音樂播放中拍在拍與拍之間，也不會把鼓聲算進去", () => {
  const result = scenario({
    clapAmp: 0.42,
    bleedGain: 0.34,
    delay: 0.05,
    clapsOnBeat: false,
    sensitivity: 1,
  });
  assert.ok(Math.abs(result.hits - result.expected) <= 1, JSON.stringify(result));
  assert.ok(result.extras <= 1, JSON.stringify(result));
});
