/**
 * onnx-driver.js
 * Client wrapper for communication with the ONNX Inference Web Worker.
 */

export class OnnxDriver {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.hasError = false;
    this.listeners = new Set();
    this.binProbListeners = new Set();
  }

  async initialize(modelUrl = '/models/nmp.onnx') {
    return new Promise((resolve) => {
      try {
        this.worker = new Worker(
          new URL('./workers/onnx-inference.worker.js', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (event) => {
          const { type, pitches, binProbabilities, error } = event.data;

          if (type === 'READY') {
            this.isReady = true;
            resolve(true);
          } else if (type === 'ERROR') {
            console.warn('ONNX worker reported error:', error);
            this.hasError = true;
            resolve(false);
          } else if (type === 'DETECTION_RESULT') {
            for (const listener of this.listeners) {
              listener(pitches);
            }
            if (binProbabilities) {
              for (const binListener of this.binProbListeners) {
                binListener(binProbabilities);
              }
            }
          }
        };

        this.worker.onerror = (err) => {
          console.warn('Worker error event:', err);
          this.hasError = true;
          resolve(false);
        };

        this.worker.postMessage({
          type: 'INIT',
          payload: { modelUrl }
        });

        // Set a timeout of 10s to not block initialization if model file loading is delayed
        setTimeout(() => {
          if (!this.isReady && !this.hasError) {
            console.warn('ONNX Worker initialization timed out, continuing in DSP Tier 2 mode.');
            resolve(false);
          }
        }, 8000);
      } catch (err) {
        console.warn('Unable to create ONNX worker:', err);
        this.hasError = true;
        resolve(false);
      }
    });
  }

  sendAudioBuffer(floatArray, sampleRate) {
    if (!this.worker || !this.isReady) return;
    const copy = new Float32Array(floatArray);
    this.worker.postMessage({
      type: 'AUDIO_BUFFER',
      payload: {
        buffer: copy.buffer,
        sampleRate
      }
    }, [copy.buffer]);
  }

  setBinGains(gainsArray) {
    if (!this.worker || !this.isReady) return;
    this.worker.postMessage({
      type: 'SET_BIN_GAINS',
      payload: gainsArray
    });
  }

  setThresholds(onset, sustain) {
    if (!this.worker || !this.isReady) return;
    this.worker.postMessage({
      type: 'SET_THRESHOLDS',
      payload: { onsetThreshold: onset, sustainThreshold: sustain }
    });
  }

  onDetection(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onBinProbabilities(fn) {
    this.binProbListeners.add(fn);
    return () => this.binProbListeners.delete(fn);
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isReady = false;
  }
}
