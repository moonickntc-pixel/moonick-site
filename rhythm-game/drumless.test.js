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

test("低頻踢鼓脈動留著，旋律不位移，長度不變", () => {
  const rate = 48000;
  const n = rate;
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i += 1) tone[i] = 0.22 * Math.sin((2 * Math.PI * 440 * i) / rate);
  const kick = new Float32Array(n);
  const at = Math.floor(0.3 * rate);
  for (let i = 0; i < Math.floor(0.04 * rate); i += 1) {
    const env = Math.exp(-i / (0.012 * rate));
    kick[at + i] = 0.8 * env * Math.sin((2 * Math.PI * 70 * i) / rate);
  }
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i += 1) mix[i] = tone[i] + kick[i];
  const out = softenDrums(mix, rate);
  assert.equal(out.length, mix.length);
  const toneIn = rms(tone, Math.floor(0.55 * rate), Math.floor(0.9 * rate));
  const toneOut = rms(out, Math.floor(0.55 * rate), Math.floor(0.9 * rate));
  assert.ok(toneOut > toneIn * 0.85, `旋律剩 ${toneOut / toneIn}`);
  const kickIn = rms(kick, at, at + Math.floor(0.04 * rate));
  const kickOut = rms(out, at, at + Math.floor(0.04 * rate));
  assert.ok(kickOut > kickIn * 0.62, `踢鼓剩 ${kickOut / kickIn}`);
  let moved = 0;
  for (let i = Math.floor(0.55 * rate); i < Math.floor(0.7 * rate); i += 1) {
    if (Math.abs(out[i] - tone[i]) > 0.002) moved += 1;
  }
  assert.ok(moved < 20, `穩態旋律被改了 ${moved} 個取樣`);
});

test("hi-hat 那種高頻 click 會被壓掉，時間軸不拉長", () => {
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
  for (let i = 0; i < Math.floor(0.006 * rate); i += 1) {
    const noise = random() * 2 - 1;
    const sample = noise - prev;
    prev = noise;
    click[at + i] = 0.85 * Math.exp(-i / (0.001 * rate)) * sample;
  }
  const out = softenDrums(click, rate);
  assert.equal(out.length, click.length);
  const before = rms(click, at, at + Math.floor(0.01 * rate));
  const after = rms(out, at, at + Math.floor(0.01 * rate));
  assert.ok(after < before * 0.22, `click 剩 ${after / before}`);
});
