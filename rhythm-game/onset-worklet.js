import { createClapDetector } from "./clap-dsp.js";

function energy(channel) {
  if (!channel || channel.length === 0) return 0;
  let sum = 0;
  const step = Math.max(1, channel.length >> 4);
  for (let i = 0; i < channel.length; i += step) sum += channel[i] * channel[i];
  return sum;
}

function sameSignal(left, right) {
  if (!left || !right || left.length !== right.length || left.length === 0) return false;
  let dot = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  const step = 2;
  for (let i = 0; i < left.length; i += step) {
    const a = left[i];
    const b = right[i];
    dot += a * b;
    leftEnergy += a * a;
    rightEnergy += b * b;
  }
  if (leftEnergy < 1e-8 || rightEnergy < 1e-8) return false;
  return dot / Math.sqrt(leftEnergy * rightEnergy) > 0.98;
}

class OnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detector = createClapDetector(sampleRate);
    this.blocks = 0;
    this.emptySince = -1;
    this.reportedSilent = false;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "config" && typeof data.sensitivity === "number") {
        this.detector.setSensitivity(data.sensitivity);
      } else if (data.type === "arm-calibration") {
        this.detector.startCalibration();
      }
    };
  }

  process(inputs) {
    const first = inputs[0] || [];
    const second = inputs[1] || [];
    let mic = first[0];
    let reference = second[0] && second[0].length ? second[0] : first[1];
    if ((!mic || mic.length === 0 || energy(mic) < 1e-10) && first[1] && energy(first[1]) > 1e-8) {
      mic = first[1];
      reference = null;
    }
    if (!mic || mic.length === 0) {
      if (this.emptySince < 0) this.emptySince = currentTime;
      if (!this.reportedSilent && currentTime - this.emptySince > 0.4) {
        this.reportedSilent = true;
        this.port.postMessage({ type: "level", rms: 0, silent: true });
      }
      return true;
    }
    if (this.reportedSilent) {
      this.reportedSilent = false;
      this.port.postMessage({ type: "level", rms: 0, silent: false });
    }
    this.emptySince = -1;
    if (reference && sameSignal(mic, reference)) reference = null;

    const silent = new Float32Array(mic.length);
    const result = this.detector.push(mic, reference && reference.length ? reference : silent);
    if (result.calibration) {
      this.port.postMessage({
        type: "calibration",
        ok: result.calibration.ok,
        delaySeconds: result.calibration.delaySeconds,
        gain: result.calibration.gain,
        confidence: result.calibration.confidence,
        refRms: result.calibration.refRms,
        micRms: result.calibration.micRms,
      });
    }
    if (result.onset) {
      this.port.postMessage({ type: "onset", time: currentTime, rms: result.rms });
    }

    this.blocks += 1;
    if (this.blocks % 12 === 0) {
      this.port.postMessage({
        type: "level",
        rms: result.rms,
        hot: result.hot,
      });
    }
    return true;
  }
}

registerProcessor("onset-processor", OnsetProcessor);
