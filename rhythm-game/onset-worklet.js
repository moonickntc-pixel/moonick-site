import { createClapDetector } from "./clap-dsp.js";

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
    // 播放參考要留著。就算和麥克風很像，也當成「有播放」，不能改傳靜音。
    if ((!mic || mic.length === 0) && reference && reference.length) {
      mic = reference;
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
      this.port.postMessage({
        type: "onset",
        time: currentTime,
        rms: result.rms,
        excess: result.excess,
        bleed: result.bleed,
        playback: result.playback,
      });
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
