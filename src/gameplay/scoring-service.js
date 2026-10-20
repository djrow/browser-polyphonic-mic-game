/**
 * scoring-service.js
 * Timing windows (PERFECT <= 50ms, GOOD <= 100ms, MISS > 100ms),
 * polyphonic chord evaluation, combo streak multipliers, and accuracy computation.
 */

export const JUDGMENTS = {
  PERFECT: { label: 'PERFECT', points: 100, windowMs: 50, color: '#38bdf8' },
  GOOD: { label: 'GOOD', points: 50, windowMs: 100, color: '#4ade80' },
  MISS: { label: 'MISS', points: 0, windowMs: Infinity, color: '#f87171' }
};

export class ScoringService {
  constructor() {
    this.reset();
    this.judgmentListeners = new Set();
    this.scoreListeners = new Set();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = {
      perfect: 0,
      good: 0,
      miss: 0
    };
    this.totalNotes = 0;
    this.processedNoteIds = new Set();
  }

  setTotalNotes(count) {
    this.totalNotes = count;
  }

  getMultiplier() {
    if (this.combo >= 30) return 4;
    if (this.combo >= 20) return 3;
    if (this.combo >= 10) return 2;
    return 1;
  }

  getAccuracy() {
    const totalJudged = this.counts.perfect + this.counts.good + this.counts.miss;
    if (totalJudged === 0) return 100.0;
    const maxPoints = totalJudged * 100;
    const earnedPoints = (this.counts.perfect * 100) + (this.counts.good * 50);
    return (earnedPoints / maxPoints) * 100;
  }

  /**
   * Evaluates player input pitch against upcoming chart notes.
   * @param {number} inputMidi
   * @param {number} playheadSeconds
   * @param {Array} activeNotes - Unjudged chart notes
   */
  evaluateInput(inputMidi, playheadSeconds, activeNotes) {
    let closestNote = null;
    let minTimeDiff = Infinity;

    // Search for closest unjudged note with matching MIDI pitch within GOOD window (100ms)
    for (const note of activeNotes) {
      if (this.processedNoteIds.has(note.id)) continue;
      if (note.midi === inputMidi) {
        const timeDiffMs = (note.time - playheadSeconds) * 1000.0;
        const absDiff = Math.abs(timeDiffMs);

        if (absDiff <= JUDGMENTS.GOOD.windowMs && absDiff < minTimeDiff) {
          minTimeDiff = absDiff;
          closestNote = { note, timeDiffMs, absDiff };
        }
      }
    }

    if (!closestNote) return null;

    const { note, timeDiffMs, absDiff } = closestNote;
    this.processedNoteIds.add(note.id);
    note.judged = true;

    let judgmentType = JUDGMENTS.GOOD;
    if (absDiff <= JUDGMENTS.PERFECT.windowMs) {
      judgmentType = JUDGMENTS.PERFECT;
      this.counts.perfect++;
    } else {
      this.counts.good++;
    }

    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const points = judgmentType.points * this.getMultiplier();
    this.score += points;

    const judgmentEvent = {
      type: judgmentType.label,
      judgment: judgmentType,
      note: note,
      deltaMs: Math.round(timeDiffMs),
      points: points,
      combo: this.combo,
      score: this.score,
      accuracy: this.getAccuracy()
    };

    this.emitJudgment(judgmentEvent);
    this.emitScore();
    return judgmentEvent;
  }

  /**
   * Checks for notes that have passed receptor beyond GOOD window (> 100ms) without being hit.
   */
  checkMissedNotes(playheadSeconds, activeNotes) {
    for (const note of activeNotes) {
      if (this.processedNoteIds.has(note.id) || note.judged) continue;

      // Note is in the past by more than 100ms
      const deltaMs = (playheadSeconds - note.time) * 1000.0;
      if (deltaMs > JUDGMENTS.GOOD.windowMs) {
        this.processedNoteIds.add(note.id);
        note.judged = true;
        this.counts.miss++;
        this.combo = 0; // Combo reset on miss

        const judgmentEvent = {
          type: JUDGMENTS.MISS.label,
          judgment: JUDGMENTS.MISS,
          note: note,
          deltaMs: Math.round(deltaMs),
          points: 0,
          combo: 0,
          score: this.score,
          accuracy: this.getAccuracy()
        };

        this.emitJudgment(judgmentEvent);
        this.emitScore();
      }
    }
  }

  emitJudgment(event) {
    for (const fn of this.judgmentListeners) {
      fn(event);
    }
  }

  emitScore() {
    const data = {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.getMultiplier(),
      accuracy: this.getAccuracy(),
      counts: { ...this.counts }
    };
    for (const fn of this.scoreListeners) {
      fn(data);
    }
  }

  onJudgment(fn) {
    this.judgmentListeners.add(fn);
    return () => this.judgmentListeners.delete(fn);
  }

  onScoreChange(fn) {
    this.scoreListeners.add(fn);
    return () => this.scoreListeners.delete(fn);
  }
}
