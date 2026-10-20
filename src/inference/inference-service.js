/**
 * inference-service.js
 * Dual-Tier Hybrid Polyphonic Inference Coordinator.
 * Fuses Tier 2 (ultra-fast Goertzel DSP, < 20ms) with Tier 1 (neural ONNX 88-bin inference).
 * Enforces 220ms refractory cooldown per pitch.
 */

import { DspPitchDetector } from './dsp-pitch-detector.js';
import { OnnxDriver } from './onnx-driver.js';
import { InstrumentProfileManager } from './instrument-profile.js';

export class InferenceService {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.dsp = new DspPitchDetector(sampleRate);
    this.onnx = new OnnxDriver();
    this.profileManager = new InstrumentProfileManager();

    // 220ms refractory lockout per pitch to prevent rapid noise chattering
    this.refractoryPeriodMs = 220;
    this.lastTriggerTimeByPitch = new Map();

    // Active pitches set
    this.activePitches = new Map(); // midi -> { time, confidence, source }

    this.noteListeners = new Set();
    this.activePitchListeners = new Set();

    // Wire ONNX detections
    this.onnx.onDetection((pitches) => {
      this.handleOnnxPitches(pitches);
    });

    // Apply profile settings
    this.applyProfile();
  }

  async initialize() {
    // Attempt ONNX worker init
    await this.onnx.initialize('/models/nmp.onnx');
    this.onnx.setBinGains(this.profileManager.getBinGains());
  }

  applyProfile() {
    const prof = this.profileManager.currentProfile;
    this.dsp.setCrestThresholds(prof.crestAttack, prof.crestSustain);
    this.dsp.setHarmonicWeights({
      octave: prof.octaveSuppression,
      fifth: prof.fifthSuppression,
      doubleOctave: prof.doubleOctaveSuppression
    });
    this.onnx.setBinGains(this.profileManager.getBinGains());
  }

  setPreset(presetKey) {
    this.profileManager.setPreset(presetKey);
    this.applyProfile();
  }

  // Audio chunk ingress from AudioCapture
  processAudioChunk(chunk, metadata = {}) {
    // Feed live instrument fine tuner if active
    this.profileManager.pushAudioChunk(chunk);

    // If gate is closed and RMS is extremely low, prune silent active pitches
    if (metadata.gateOpen === false && metadata.rms < 0.003) {
      if (this.activePitches.size > 0) {
        this.activePitches.clear();
        this.emitActivePitches();
      }
      return;
    }

    // 1. Tier 2: Instant DSP Goertzel detection (< 20 ms attack)
    this.dsp.pushSamples(chunk);
    const dspCandidates = this.dsp.detect();
    const now = performance.now();

    for (const cand of dspCandidates) {
      const midi = cand.midi;
      const lastTrigger = this.lastTriggerTimeByPitch.get(midi) || 0;

      if (now - lastTrigger >= this.refractoryPeriodMs) {
        if (cand.isOnset || !this.activePitches.has(midi)) {
          this.lastTriggerTimeByPitch.set(midi, now);
          this.activePitches.set(midi, {
            midi: midi,
            time: now,
            confidence: cand.confidence,
            source: 'dsp'
          });

          this.emitNoteOn(midi, cand.confidence, 'dsp');
        }
      } else {
        // Sustain refresh
        if (this.activePitches.has(midi)) {
          this.activePitches.get(midi).time = now;
        }
      }
    }

    // 2. Stream chunk to Tier 1: ONNX Neural Worker
    this.onnx.sendAudioBuffer(chunk, this.sampleRate);

    // Prune stale pitches that haven't refreshed in 350ms
    for (const [midi, info] of this.activePitches.entries()) {
      if (now - info.time > 350) {
        this.activePitches.delete(midi);
      }
    }

    this.emitActivePitches();
  }

  handleOnnxPitches(pitches) {
    const now = performance.now();

    for (const p of pitches) {
      const midi = p.midi;
      const lastTrigger = this.lastTriggerTimeByPitch.get(midi) || 0;

      if (p.isOnset && (now - lastTrigger >= this.refractoryPeriodMs)) {
        this.lastTriggerTimeByPitch.set(midi, now);
        this.activePitches.set(midi, {
          midi: midi,
          time: now,
          confidence: p.prob,
          source: 'onnx'
        });
        this.emitNoteOn(midi, p.prob, 'onnx');
      } else if (p.prob >= 0.32) {
        // Sustaining note confirmed by neural model
        this.activePitches.set(midi, {
          midi: midi,
          time: now,
          confidence: p.prob,
          source: 'onnx'
        });
      }
    }

    this.emitActivePitches();
  }

  // Allow manual / virtual trigger (for keyboard / testing)
  triggerNote(midi, velocity = 0.8) {
    const now = performance.now();
    const lastTrigger = this.lastTriggerTimeByPitch.get(midi) || 0;

    if (now - lastTrigger >= this.refractoryPeriodMs) {
      this.lastTriggerTimeByPitch.set(midi, now);
      this.activePitches.set(midi, {
        midi: midi,
        time: now,
        confidence: velocity,
        source: 'manual'
      });
      this.emitNoteOn(midi, velocity, 'manual');
      this.emitActivePitches();
    }
  }

  releaseNote(midi) {
    if (this.activePitches.has(midi)) {
      this.activePitches.delete(midi);
      this.emitActivePitches();
    }
  }

  emitNoteOn(midi, confidence, source) {
    for (const listener of this.noteListeners) {
      listener({ midi, confidence, source, time: performance.now() });
    }
  }

  emitActivePitches() {
    const list = Array.from(this.activePitches.keys());
    for (const listener of this.activePitchListeners) {
      listener(list);
    }
  }

  onNoteOn(fn) {
    this.noteListeners.add(fn);
    return () => this.noteListeners.delete(fn);
  }

  onActivePitchesChange(fn) {
    this.activePitchListeners.add(fn);
    return () => this.activePitchListeners.delete(fn);
  }
}
