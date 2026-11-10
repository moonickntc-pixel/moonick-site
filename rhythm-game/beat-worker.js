import Essentia from "./vendor/essentia.js-core.es.js";
import { EssentiaWASM } from "./vendor/essentia-wasm.es.js";

let essentia = null;

function engine() {
  if (!essentia) essentia = new Essentia(EssentiaWASM);
  return essentia;
}

function ticksOf(es, vector) {
  try {
    if (!vector || vector.size() === 0) return [];
    return Array.from(es.vectorToArray(vector));
  } catch {
    return [];
  }
}

function release(vector) {
  try {
    vector?.delete?.();
  } catch {
    /* already freed */
  }
}

function track(es, samples) {
  const signal = es.arrayToVector(samples);
  try {
    const rhythm = es.RhythmExtractor2013(signal, 208, "multifeature", 40);
    const ticks = ticksOf(es, rhythm.ticks);
    const result = { bpm: rhythm.bpm, confidence: rhythm.confidence, ticks };
    release(rhythm.ticks);
    release(rhythm.estimates);
    release(rhythm.bpmIntervals);
    return result;
  } finally {
    release(signal);
  }
}

self.onmessage = (event) => {
  const samples = event.data?.samples;
  if (!(samples instanceof Float32Array)) {
    self.postMessage({ phase: "done", ok: false, message: "沒有音檔" });
    return;
  }
  try {
    const es = engine();
    self.postMessage({ phase: "analyzing" });
    const found = track(es, samples);
    self.postMessage({ phase: "done", ok: true, ...found });
  } catch (error) {
    self.postMessage({
      phase: "done",
      ok: false,
      message: error instanceof Error ? error.message : "分析失敗",
    });
  }
};
