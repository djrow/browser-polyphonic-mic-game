/**
 * scoring-service.test.js
 * Verification of timing windows, combo multipliers, chord scoring, and accuracy.
 */

import { describe, it, expect } from 'vitest';
import { ScoringService } from '../../src/gameplay/scoring-service.js';

describe('Scoring & Judgment Engine', () => {
  it('judges notes within PERFECT window (<= 50ms) with 100 points', () => {
    const scoring = new ScoringService();
    const notes = [
      { id: 'n1', midi: 60, time: 2.0, duration: 0.5, judged: false }
    ];

    // Input hit at 2.025s (delta = +25ms -> PERFECT)
    const result = scoring.evaluateInput(60, 2.025, notes);
    expect(result).not.toBeNull();
    expect(result.type).toBe('PERFECT');
    expect(result.points).toBe(100);
    expect(scoring.combo).toBe(1);
    expect(scoring.score).toBe(100);
  });

  it('judges notes within GOOD window (51ms to 100ms) with 50 points', () => {
    const scoring = new ScoringService();
    const notes = [
      { id: 'n1', midi: 64, time: 2.0, duration: 0.5, judged: false }
    ];

    // Input hit at 2.080s (delta = +80ms -> GOOD)
    const result = scoring.evaluateInput(64, 2.080, notes);
    expect(result).not.toBeNull();
    expect(result.type).toBe('GOOD');
    expect(result.points).toBe(50);
    expect(scoring.combo).toBe(1);
  });

  it('increases score multipliers based on combo streak', () => {
    const scoring = new ScoringService();
    expect(scoring.getMultiplier()).toBe(1);

    scoring.combo = 10;
    expect(scoring.getMultiplier()).toBe(2);

    scoring.combo = 20;
    expect(scoring.getMultiplier()).toBe(3);

    scoring.combo = 30;
    expect(scoring.getMultiplier()).toBe(4);
  });

  it('evaluates polyphonic chord notes simultaneously and individually', () => {
    const scoring = new ScoringService();
    // C Major chord at t = 3.0s
    const notes = [
      { id: 'c', midi: 60, time: 3.0, duration: 0.5, judged: false },
      { id: 'e', midi: 64, time: 3.0, duration: 0.5, judged: false },
      { id: 'g', midi: 67, time: 3.0, duration: 0.5, judged: false }
    ];

    // Player strikes C4 and E4 at 3.01s (within PERFECT)
    const hit1 = scoring.evaluateInput(60, 3.01, notes);
    const hit2 = scoring.evaluateInput(64, 3.01, notes);

    expect(hit1.type).toBe('PERFECT');
    expect(hit2.type).toBe('PERFECT');
    expect(scoring.combo).toBe(2);

    // G4 was unhit, time advances to 3.15s (> 100ms past 3.0s)
    scoring.checkMissedNotes(3.15, notes);

    expect(scoring.counts.miss).toBe(1);
    expect(scoring.combo).toBe(0); // Combo resets on miss
  });
});
