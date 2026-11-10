import assert from "node:assert/strict";
import test from "node:test";
import { softenDrums } from "./drumless.js";

function rms(samples, start, end) {
  let energy = 0;
  const from = Math.max(0, start);
  const to = Math.min(samples.length, end);
  for (let i = from; i < to; i += 1) energy += samples[i] * samples[i];
  return Math.sqrt(energy / Math.max(1, to - from));
}

test("去鼓後長度不變，持續的音還在，鼓的攻擊變小", () => {
  const rate = 48000;
  const n = rate;
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i += 1) tone[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / rate);
  const drum = new Float32Array(n);
  for (let i = 0; i < Math.floor(0.03 * rate); i += 1) {
    const env = Math.exp(-i / (0.006 * rate));
    drum[Math.floor(0.2 * rate) + i] = 0.9 * env * Math.sin((2 * Math.PI * 70 * i) / rate);
  }
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i += 1) mix[i] = tone[i] + drum[i];
  const out = softenDrums(mix, rate);
  assert.equal(out.length, mix.length);
  const toneIn = rms(tone, Math.floor(0.4 * rate), Math.floor(0.9 * rate));
  const toneOut = rms(out, Math.floor(0.4 * rate), Math.floor(0.9 * rate));
  assert.ok(toneOut > toneIn * 0.72, `旋律剩 ${toneOut / toneIn}`);
  const hitIn = rms(mix, Math.floor(0.2 * rate), Math.floor(0.23 * rate));
  const hitOut = rms(out, Math.floor(0.2 * rate), Math.floor(0.23 * rate));
  assert.ok(hitOut < hitIn * 0.22, `鼓的攻擊剩 ${hitOut / hitIn}`);
  let best = -Infinity;
  let bestLag = 0;
  for (let lag = -4; lag <= 4; lag += 1) {
    let dot = 0;
    for (let i = Math.floor(0.45 * rate); i < Math.floor(0.7 * rate); i += 1) {
      dot += tone[i] * (out[i + lag] || 0);
    }
    if (dot > best) {
      best = dot;
      bestLag = lag;
    }
  }
  assert.ok(Math.abs(bestLag) <= 1, `旋律偏移 ${bestLag} 個取樣`);
});

test("hi-hat 那種高頻 click 也會被壓掉", () => {
  const rate = 44100;
  const n = rate;
  const click = new Float32Array(n);
  let state = 9;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const at = Math.floor(0.25 * rate);
  let prev = 0;
  for (let i = 0; i < Math.floor(0.007 * rate); i += 1) {
    const noise = random() * 2 - 1;
    const sample = noise - prev;
    prev = noise;
    click[at + i] = 0.8 * Math.exp(-i / (0.0012 * rate)) * sample;
  }
  const out = softenDrums(click, rate);
  assert.equal(out.length, click.length);
  const before = rms(click, at, at + Math.floor(0.012 * rate));
  const after = rms(out, at, at + Math.floor(0.012 * rate));
  assert.ok(after < before * 0.18, `click 剩 ${after / before}`);
});
