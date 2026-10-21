/**
 * highway-renderer.js
 * High-performance Grand Staff Note Highway (Treble & Bass staves, C4 ledger).
 * Scrolls right-to-left with sub-frame audio playhead synchronization.
 * Fixed receptor at X = 160px.
 */

import { getNoteY, getDiatonicStep, getAccidental, calculateChordOffsets, midiToNoteName } from '../gameplay/note-data.js';
import { JudgmentEffects } from './judgment-effects.js';

export class HighwayRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.effects = new JudgmentEffects();

    this.receptorX = 160;
    this.scrollSpeed = 240; // pixels per second
    this.dpr = window.devicePixelRatio || 1;

    // Staff geometry metrics
    this.staffMetrics = {
      lineSpacing: 14,
      stepSpacing: 7,
      trebleTopY: 80,
      middleCY: 160,
      bassTopY: 200
    };

    this.activePitches = [];
    this.song = null;

    this.resize();
    const debouncedResize = () => {
      this.resize();
      setTimeout(() => this.resize(), 100);
      setTimeout(() => this.resize(), 300);
    };
    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', debouncedResize);
    window.screen?.orientation?.addEventListener?.('change', debouncedResize);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.round(rect.width) || window.innerWidth;
    this.height = Math.round(rect.height) || 360;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.resetTransform?.();
    this.ctx.scale(this.dpr, this.dpr);

    // Responsive receptor position based on screen width
    this.receptorX = Math.min(160, Math.max(90, Math.round(this.width * 0.22)));

    // Compute vertical staff layout centered in canvas
    const centerY = this.height / 2;
    this.staffMetrics.stepSpacing = Math.max(4.5, Math.min(10, this.height / 42));
    this.staffMetrics.lineSpacing = this.staffMetrics.stepSpacing * 2;
    this.staffMetrics.middleCY = centerY;

    // Treble staff lines: 5 lines, F5 down to E4
    // F5 is step +10 from C4 -> middleCY - 10 * stepSpacing
    // E4 is step +2 from C4 -> middleCY - 2 * stepSpacing
    this.staffMetrics.trebleTopY = this.staffMetrics.middleCY - (10 * this.staffMetrics.stepSpacing);

    // Bass staff lines: 5 lines, A3 down to G2
    // A3 is step -2 from C4 -> middleCY - (-2) * stepSpacing = middleCY + 2 * stepSpacing
    // G2 is step -10 from C4 -> middleCY + 10 * stepSpacing
    this.staffMetrics.bassTopY = this.staffMetrics.middleCY + (2 * this.staffMetrics.stepSpacing);
  }

  setSong(song) {
    this.song = song;
  }

  setActivePitches(pitches) {
    this.activePitches = pitches || [];
  }

  setScrollSpeed(speed) {
    this.scrollSpeed = Math.max(120, Math.min(480, speed));
  }

  triggerHitEffect(note, judgmentType) {
    const y = getNoteY(note.midi, this.staffMetrics);
    this.effects.triggerHit(this.receptorX, y, judgmentType);
  }

  triggerMissEffect(note) {
    const y = getNoteY(note.midi, this.staffMetrics);
    this.effects.triggerMiss(this.receptorX, y);
  }

  render(playheadSeconds) {
    const { ctx, width, height, staffMetrics, receptorX } = this;
    ctx.clearRect(0, 0, width, height);

    // 1. Highway Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(0.5, '#0d1527');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Grand Staff Lines
    ctx.save();
    ctx.lineWidth = 1.2;

    // Treble staff (5 lines)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    for (let i = 0; i < 5; i++) {
      const y = staffMetrics.trebleTopY + i * staffMetrics.lineSpacing;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Bass staff (5 lines)
    for (let i = 0; i < 5; i++) {
      const y = staffMetrics.bassTopY + i * staffMetrics.lineSpacing;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Clef labels on the far left
    ctx.font = 'bold 26px "Times New Roman", serif';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('𝄞', 30, staffMetrics.trebleTopY + staffMetrics.lineSpacing * 2.5); // Treble Clef
    ctx.fillText('𝄢', 30, staffMetrics.bassTopY + staffMetrics.lineSpacing * 1.5);   // Bass Clef

    // 3. Receptor Bar (Hit Line at X = 160)
    // Draw neon glowing vertical target line
    const hitGrad = ctx.createLinearGradient(receptorX - 4, 0, receptorX + 4, 0);
    hitGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    hitGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.85)');
    hitGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = hitGrad;
    ctx.fillRect(receptorX - 3, 0, 6, height);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(receptorX, 0);
    ctx.lineTo(receptorX, height);
    ctx.stroke();

    // 4. Live Pitch Active Indicator on Receptor Line
    if (this.activePitches.length > 0) {
      for (const activeMidi of this.activePitches) {
        const liveY = getNoteY(activeMidi, staffMetrics);
        // Draw bright glowing pulsing ring
        ctx.fillStyle = '#4ade80';
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(receptorX, liveY, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(receptorX, liveY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // 5. Notes Highway Rendering
    if (this.song && this.song.notes) {
      // Find visible notes window
      const visibleLeftTime = playheadSeconds - 0.5;
      const visibleRightTime = playheadSeconds + (width - receptorX + 100) / this.scrollSpeed;

      const visibleNotes = this.song.notes.filter(
        (n) => (n.time + n.duration) >= visibleLeftTime && n.time <= visibleRightTime
      );

      // Group notes occurring at same timestamp to resolve harmonic seconds collision offsets
      const chordGroups = new Map();
      for (const note of visibleNotes) {
        const key = Math.round(note.time * 20); // ~50ms tolerance
        if (!chordGroups.has(key)) chordGroups.set(key, []);
        chordGroups.get(key).push(note);
      }

      for (const [key, chordNotes] of chordGroups.entries()) {
        const chordOffsets = calculateChordOffsets(chordNotes);

        for (const note of chordNotes) {
          if (note.judged && (playheadSeconds - note.time) > 0.15) {
            continue; // Skip notes already hit/missed that rolled far past
          }

          const noteX = receptorX + (note.time - playheadSeconds) * this.scrollSpeed;
          const noteY = getNoteY(note.midi, staffMetrics);
          const collisionXOffset = chordOffsets.get(note.id || note.midi) || 0;
          const finalNoteX = noteX + collisionXOffset;
          const sustainWidth = Math.max(0, note.duration * this.scrollSpeed);

          // Render sustain tail if duration > 0.2s
          if (note.duration >= 0.2) {
            const tailGrad = ctx.createLinearGradient(finalNoteX, 0, finalNoteX + sustainWidth, 0);
            tailGrad.addColorStop(0, 'rgba(56, 189, 248, 0.7)');
            tailGrad.addColorStop(1, 'rgba(147, 197, 253, 0.15)');
            ctx.fillStyle = tailGrad;
            ctx.beginPath();
            ctx.roundRect(finalNoteX + 4, noteY - 3, sustainWidth - 4, 6, 3);
            ctx.fill();
          }

          // Ledger lines for notes outside standard staves
          this.drawLedgerLines(ctx, finalNoteX, note.midi, staffMetrics);

          // Notehead shadow & fill
          ctx.save();
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 8;

          // Notehead ellipse (music standard tilted ellipse)
          ctx.translate(finalNoteX, noteY);
          ctx.rotate(-0.35); // tilt notehead slightly upward
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(0, 0, 7.5, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Accidental sharp/flat badge
          const accidental = getAccidental(note.midi);
          if (accidental) {
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 12px "Inter", sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(accidental, finalNoteX - 10, noteY - 1);
          }

          // Pitch label on notehead
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 9px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(note.name, finalNoteX, noteY);
        }
      }
    }

    // 6. Update and render particle punch & rating toasts
    this.effects.update();
    this.effects.render(ctx);

    ctx.restore();
  }

  drawLedgerLines(ctx, x, midi, staffMetrics) {
    const step = getDiatonicStep(midi);
    // Middle C4 (step 0): draw 1 ledger line
    if (step === 0) {
      const y = staffMetrics.middleCY;
      this.renderLedgerLine(ctx, x, y);
    }
    // High treble (above F5, step > 10): A5 (step 12), C6 (step 14)
    else if (step > 10) {
      // Lines exist on even diatonic steps
      for (let s = 12; s <= step; s += 2) {
        const y = staffMetrics.middleCY - (s * staffMetrics.stepSpacing);
        this.renderLedgerLine(ctx, x, y);
      }
    }
    // Low bass (below G2, step < -10): E2 (step -12), C2 (step -14)
    else if (step < -10) {
      for (let s = -12; s >= step; s -= 2) {
        const y = staffMetrics.middleCY - (s * staffMetrics.stepSpacing);
        this.renderLedgerLine(ctx, x, y);
      }
    }
  }

  renderLedgerLine(ctx, x, y) {
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.stroke();
  }
}
