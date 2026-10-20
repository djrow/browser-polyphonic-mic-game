/**
 * verification-suite.js
 * End-to-end synthetic audio verification harness.
 * Simulates real microphone input feeding the DSP and Scoring engine.
 */

import { describe, it, expect } from 'vitest';
import { DspPitchDetector } from '../../src/inference/dsp-pitch-detector.js';
import { ScoringService } from '../../src/gameplay/scoring-service.js';
import { LevelLoader } from '../../src/gameplay/level-loader.js';

describe('End-to-End Synthetic Pipeline Verification', () => {
  it('simulates live microphone audio stream and verifies note hits on the Grand Staff highway', () => {
    const sampleRate = 44100;
    const detector = new DspPitchDetector(sampleRate);
    const scoring = new ScoringService();
    const song = LevelLoader.getBundledSong('piece_1_monophonic');
    scoring.setTotalNotes(song.notes.length);

    // First note in Ode to Joy is E4 (MIDI 64) at time = 0.5s
    const firstNote = song.notes[0];
    expect(firstNote.midi).toBe(64);
    expect(firstNote.time).toBe(0.5);

    // Simulate player playing E4 (329.63 Hz) at playhead = 0.51s (+10ms delta -> PERFECT window)
    const playheadTime = 0.51;
    const e4Freq = 329.63;
    const chunkSize = 2048;
    const micChunk = new Float32Array(chunkSize);

    for (let i = 0; i < chunkSize; i++) {
      micChunk[i] = 0.7 * Math.sin((2 * Math.PI * e4Freq * i) / sampleRate);
    }

    // 1. Audio ingress through DSP detector
    detector.pushSamples(micChunk);
    const detections = detector.detect();

    expect(detections.length).toBeGreaterThan(0);
    const detectedE4 = detections.find((d) => d.midi === 64);
    expect(detectedE4).toBeDefined();

    // 2. Feed detected pitch into scoring engine
    const judgment = scoring.evaluateInput(detectedE4.midi, playheadTime, song.notes);

    expect(judgment).not.toBeNull();
    expect(judgment.type).toBe('PERFECT');
    expect(Math.abs(judgment.deltaMs)).toBe(10);
    expect(judgment.points).toBe(100);
    expect(scoring.combo).toBe(1);
    expect(scoring.score).toBe(100);
    expect(firstNote.judged).toBe(true);
  });

  it('verifies polyphonic C-E-G chord simultaneous strike and scoring', () => {
    const sampleRate = 44100;
    const detector = new DspPitchDetector(sampleRate);
    const scoring = new ScoringService();
    const song = LevelLoader.getBundledSong('piece_3_polyphonic');

    // Final chord in piece 3 contains C4 (60), E4 (64), G4 (67) at 8.8s
    const chordNotes = song.notes.filter((n) => Math.abs(n.time - 8.8) < 0.05);
    expect(chordNotes.length).toBe(4);

    // Synthesize C Major triad chord audio (C4=261.63, E4=329.63, G4=392.00)
    const freqs = [261.63, 329.63, 392.00];
    const chunkSize = 2048;
    const chordChunk = new Float32Array(chunkSize);

    for (let i = 0; i < chunkSize; i++) {
      let s = 0;
      for (const f of freqs) s += Math.sin((2 * Math.PI * f * i) / sampleRate);
      chordChunk[i] = (s / freqs.length) * 0.7;
    }

    detector.pushSamples(chordChunk);
    const detections = detector.detect();
    const detectedMidis = detections.map((d) => d.midi);

    expect(detectedMidis).toContain(60);
    expect(detectedMidis).toContain(64);
    expect(detectedMidis).toContain(67);

    // Player strikes chord at 8.82s (+20ms -> PERFECT)
    let hitsCount = 0;
    for (const d of detections) {
      const res = scoring.evaluateInput(d.midi, 8.82, song.notes);
      if (res && res.type === 'PERFECT') {
        hitsCount++;
      }
    }

    expect(hitsCount).toBe(3);
    expect(scoring.combo).toBe(3);
  });
});
