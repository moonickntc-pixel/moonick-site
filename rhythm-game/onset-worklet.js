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
    const channels = inputs[0] || [];
    const mic = channels[0];
    const reference = channels[1];
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
    const result = this.detector.push(
      mic,
      reference && reference.length === mic.length ? reference : silent,
    );
    if (result.calibration) {
      this.port.postMessage({
        type: "calibration",
        ok: result.calibration.ok,
        delaySeconds: result.calibration.delaySeconds,
        gain: result.calibration.gain,
        confidence: result.calibration.confidence,
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
