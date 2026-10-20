/**
 * audio-capture.js
 * Manages low-latency microphone stream capture and AudioWorkletNode lifecycle.
 */

export class AudioCapture {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.mediaStream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.isCapturing = false;
    this.currentDeviceId = null;
    this.listeners = new Set();
    this.rmsListeners = new Set();
    this.deviceChangeListeners = new Set();
    this.gateThreshold = 0.005; // -46 dB
    this.holdTimeMs = 300;

    // Listen for device change events (e.g. plugging/unplugging microphones)
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        const devices = await this.getAudioInputDevices();
        for (const fn of this.deviceChangeListeners) {
          fn(devices);
        }
      });
    }
  }

  async initialize() {
    // Add the worklet module to the audioContext
    const workletUrl = new URL('./worklets/mic-processor.worklet.js', import.meta.url);
    await this.audioContext.audioWorklet.addModule(workletUrl);
  }

  async getAudioInputDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'audioinput');
    } catch (err) {
      console.warn('Failed to enumerate audio devices:', err);
      return [];
    }
  }

  async startCapture(deviceId = null) {
    if (this.isCapturing && deviceId && deviceId === this.currentDeviceId) return;

    if (this.isCapturing) {
      this.stopCapture();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      const audioConstraints = {
        channelCount: { ideal: 1 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0.01
      };

      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
        this.currentDeviceId = deviceId;
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'mic-processor');

      this.workletNode.port.onmessage = (event) => {
        const data = event.data;
        if (data.type === 'AUDIO_CHUNK') {
          const floatArray = new Float32Array(data.buffer);
          for (const listener of this.listeners) {
            listener(floatArray, data);
          }
          for (const rmsListener of this.rmsListeners) {
            rmsListener(data.rms, data.gateOpen);
          }
        }
      };

      // Set initial parameters
      this.workletNode.port.postMessage({
        type: 'SET_GATE_THRESHOLD',
        payload: this.gateThreshold
      });
      this.workletNode.port.postMessage({
        type: 'SET_HOLD_TIME_MS',
        payload: this.holdTimeMs
      });

      // Connect source to worklet. Do NOT connect to audioContext.destination to avoid mic feedback!
      this.sourceNode.connect(this.workletNode);
      this.isCapturing = true;
    } catch (err) {
      console.error('Failed to capture audio from microphone:', err);
      throw err;
    }
  }

  async switchDevice(deviceId) {
    this.currentDeviceId = deviceId;
    if (this.isCapturing) {
      await this.startCapture(deviceId);
    }
  }

  stopCapture() {
    if (!this.isCapturing) return;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.isCapturing = false;
  }

  setGateThreshold(threshold) {
    this.gateThreshold = threshold;
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'SET_GATE_THRESHOLD',
        payload: threshold
      });
    }
  }

  setHoldTimeMs(ms) {
    this.holdTimeMs = ms;
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'SET_HOLD_TIME_MS',
        payload: ms
      });
    }
  }

  onAudioChunk(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onRms(fn) {
    this.rmsListeners.add(fn);
    return () => this.rmsListeners.delete(fn);
  }
}
