/**
 * onnx-driver.js
 * Client wrapper for communication with the ONNX Inference Web Worker.
 */

export class OnnxDriver {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.hasError = false;
    this.statusInfo = { state: 'initializing', message: 'Starting worker...', inferenceTimeMs: 0 };
    this.listeners = new Set();
    this.binProbListeners = new Set();
    this.statusListeners = new Set();
  }

  async initialize(modelUrl = '/models/nmp.onnx') {
    return new Promise((resolve) => {
      try {
        this.worker = new Worker(
          new URL('./workers/onnx-inference.worker.js', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (event) => {
          const { type, pitches, binProbabilities, error, status, message, info, inferenceTimeMs } = event.data;

          if (type === 'STATUS') {
            this.statusInfo = { state: status, message };
            this.emitStatus();
          } else if (type === 'READY') {
            this.isReady = true;
            this.statusInfo = { state: 'ready', message: 'Spotify Basic Pitch ONNX Active', info };
            this.emitStatus();
            resolve(true);
          } else if (type === 'ERROR') {
            console.warn('ONNX worker reported error:', error);
            this.hasError = true;
            this.statusInfo = { state: 'error', message: error };
            this.emitStatus();
            resolve(false);
          } else if (type === 'DETECTION_RESULT') {
            if (inferenceTimeMs !== undefined) {
              this.statusInfo.inferenceTimeMs = inferenceTimeMs;
              this.emitStatus();
            }
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

  onStatusChange(fn) {
    this.statusListeners.add(fn);
    fn(this.statusInfo);
    return () => this.statusListeners.delete(fn);
  }

  emitStatus() {
    for (const fn of this.statusListeners) {
      fn(this.statusInfo);
    }
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isReady = false;
  }
}
