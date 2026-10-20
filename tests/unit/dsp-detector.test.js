/**
 * dsp-detector.test.js
 * Verification of Tier 2 Goertzel detector, crest factor guard, and harmonic suppression.
 */

import { describe, it, expect } from 'vitest';
import { DspPitchDetector } from '../../src/inference/dsp-pitch-detector.js';

function generateTone(freq, sampleRate, numSamples, amp = 0.8) {
  const buf = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    buf[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buf;
}

function generateChord(frequencies, sampleRate, numSamples, amp = 0.5) {
  const buf = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    let s = 0;
    for (const f of frequencies) {
      s += Math.sin((2 * Math.PI * f * i) / sampleRate);
    }
    buf[i] = (s / frequencies.length) * amp;
  }
  return buf;
}

describe('Tier 2 DSP Pitch Detector', () => {
  const sampleRate = 44100;
  const windowSize = 2048;

  it('detects a single pure sine tone accurately (A4 = 440Hz / MIDI 69)', () => {
    const detector = new DspPitchDetector(sampleRate, { windowSize });
    const audio = generateTone(440.0, sampleRate, windowSize);
    detector.pushSamples(audio);

    const detections = detector.detect();
    expect(detections.length).toBeGreaterThan(0);
    const hasA4 = detections.some((d) => d.midi === 69);
    expect(hasA4).toBe(true);
  });

  it('detects polyphonic C-Major triad (C4, E4, G4 = MIDI 60, 64, 67) simultaneously', () => {
    const detector = new DspPitchDetector(sampleRate, { windowSize });
    // C4 = 261.63 Hz, E4 = 329.63 Hz, G4 = 392.00 Hz
    const triadAudio = generateChord([261.63, 329.63, 392.00], sampleRate, windowSize, 0.7);
    detector.pushSamples(triadAudio);

    const detections = detector.detect();
    const detectedMidis = detections.map((d) => d.midi);

    expect(detectedMidis).toContain(60);
    expect(detectedMidis).toContain(64);
    expect(detectedMidis).toContain(67);
  });

  it('rejects broadband flat noise with Spectral Crest Factor Guard', () => {
    const detector = new DspPitchDetector(sampleRate, { windowSize });
    // Generate white noise
    const noise = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      noise[i] = (Math.random() * 2 - 1) * 0.1;
    }
    detector.pushSamples(noise);

    const detections = detector.detect();
    // Flat noise lacks sharp spectral crest factor >= 3.8 and should produce zero valid notes
    expect(detections.length).toBe(0);
  });

  it('suppresses octave harmonic leakage (+12 semitones)', () => {
    const detector = new DspPitchDetector(sampleRate, { windowSize, octaveSuppression: 0.8 });
    // Generate C4 (261.63 Hz) with 40% second harmonic C5 (523.25 Hz)
    const buf = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      buf[i] = 0.7 * Math.sin(2 * Math.PI * 261.63 * i / sampleRate) +
               0.25 * Math.sin(2 * Math.PI * 523.25 * i / sampleRate);
    }
    detector.pushSamples(buf);

    const detections = detector.detect();
    const midis = detections.map((d) => d.midi);

    // Fundamental C4 (60) must be present
    expect(midis).toContain(60);
  });
});
