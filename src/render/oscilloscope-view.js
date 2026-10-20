/**
 * oscilloscope-view.js
 * High-speed zero-crossing oscilloscope, RMS level meter, and active detected pitches dock.
 * Features:
 *  - Retro-modern CRT grid reticle
 *  - Zero-crossing triggered waveform stabilization
 *  - Continuous idle scan beam
 *  - Accurate RMS bar with -46 dB gate threshold marker
 *  - Active polyphonic chord pitch badges
 */

import { midiToNoteName } from '../gameplay/note-data.js';

export class OscilloscopeView {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.audioData = new Float32Array(512);
    this.rms = 0.0;
    this.gateOpen = false;
    this.activePitches = [];
    this.dpr = window.devicePixelRatio || 1;
    this.scanPhase = 0;
    this.modelStatus = 'Ready';

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setModelStatus(status) {
    this.modelStatus = status;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    // Use layout width or fallback to 340x80
    this.width = Math.round(rect.width) || 340;
    this.height = Math.round(rect.height) || 80;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;

    this.ctx.resetTransform?.();
    this.ctx.scale(this.dpr, this.dpr);
  }

  updateAudio(floatArray, rms, gateOpen) {
    if (floatArray && floatArray.length > 0) {
      const len = Math.min(floatArray.length, this.audioData.length);
      this.audioData.set(floatArray.subarray(0, len));
    }
    if (rms !== undefined) this.rms = rms;
    if (gateOpen !== undefined) this.gateOpen = gateOpen;
  }

  setActivePitches(pitches) {
    this.activePitches = pitches || [];
  }

  render() {
    const { ctx, width, height } = this;
    if (width <= 0 || height <= 0) return;

    this.scanPhase = (this.scanPhase + 0.04) % (Math.PI * 2);

    ctx.clearRect(0, 0, width, height);

    // 1. Dark CRT oscilloscope background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#070d18');
    bgGrad.addColorStop(0.5, '#0b1626');
    bgGrad.addColorStop(1, '#070d18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Oscilloscope reticle grid
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;

    // Horizontal center line
    const midY = Math.round(height * 0.44);
    ctx.beginPath();
    ctx.setLineDash([2, 4]);
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Vertical subdivisions
    for (let x = 40; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 16);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // 3. Oscilloscope Waveform with zero-crossing search
    let startIndex = 0;
    let hasSignal = false;

    // Check if audio has real signal
    if (this.rms > 0.001 || this.gateOpen) {
      for (let i = 0; i < this.audioData.length - 1; i++) {
        if (Math.abs(this.audioData[i]) > 0.002) hasSignal = true;
        if (this.audioData[i] < 0 && this.audioData[i + 1] >= 0) {
          startIndex = i;
          break;
        }
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = this.gateOpen ? '#38bdf8' : (hasSignal ? '#818cf8' : '#334155');
    ctx.lineWidth = 1.8;
    ctx.shadowColor = this.gateOpen ? '#38bdf8' : '#818cf8';
    ctx.shadowBlur = this.gateOpen ? 8 : 2;

    const pointsToDraw = Math.min(256, this.audioData.length - startIndex);
    const sliceWidth = (width - 16) / pointsToDraw;

    if (hasSignal) {
      for (let i = 0; i < pointsToDraw; i++) {
        const s = this.audioData[startIndex + i];
        const x = 8 + i * sliceWidth;
        const y = midY - s * (height * 0.38);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else {
      // Idle oscilloscope scanning ripple
      for (let i = 0; i < pointsToDraw; i++) {
        const x = 8 + i * sliceWidth;
        const idleWave = Math.sin((i * 0.08) + this.scanPhase) * 1.5;
        const y = midY + idleWave;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 4. RMS Level Meter Bar at bottom
    const meterY = height - 14;
    const meterHeight = 6;
    const meterWidth = width - 16;

    // Meter track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(8, meterY, meterWidth, meterHeight);

    // RMS level fill (scaled exponentially for dB-like responsiveness)
    const normRms = Math.min(1.0, Math.sqrt(this.rms * 12.0));
    const fillWidth = meterWidth * normRms;

    const barGrad = ctx.createLinearGradient(8, 0, 8 + meterWidth, 0);
    barGrad.addColorStop(0, '#38bdf8');
    barGrad.addColorStop(0.5, '#4ade80');
    barGrad.addColorStop(1, '#ef4444');
    ctx.fillStyle = this.gateOpen ? barGrad : '#64748b';
    ctx.fillRect(8, meterY, fillWidth, meterHeight);

    // Gate threshold marker line (-46 dB ~ 0.005)
    const gateMarkerX = 8 + meterWidth * Math.sqrt(0.005 * 12.0);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gateMarkerX, meterY - 2);
    ctx.lineTo(gateMarkerX, meterY + meterHeight + 2);
    ctx.stroke();

    // Small label for gate marker
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('-46dB', gateMarkerX, meterY - 3);

    // 5. Active Chord Pitch Badges (Top right of oscilloscope)
    if (this.activePitches.length > 0) {
      let badgeX = width - 8;
      for (let i = this.activePitches.length - 1; i >= 0; i--) {
        const midi = this.activePitches[i];
        const noteName = midiToNoteName(midi);

        ctx.font = 'bold 11px "Inter", sans-serif';
        const textWidth = ctx.measureText(noteName).width;
        const boxWidth = textWidth + 14;
        badgeX -= boxWidth;

        ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(badgeX, 5, boxWidth, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteName, badgeX + boxWidth / 2, 14);

        badgeX -= 5;
      }
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '9px "Inter", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(
        this.gateOpen ? 'Listening (Gate Open)' : 'Gate Closed (< -46dB)',
        width - 8,
        6
      );
    }

    // Border around oscilloscope canvas
    ctx.strokeStyle = this.gateOpen ? 'rgba(56, 189, 248, 0.5)' : 'rgba(71, 85, 105, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }
}
