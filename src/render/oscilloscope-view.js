/**
 * oscilloscope-view.js
 * High-speed zero-crossing oscilloscope, RMS level meter, and active detected pitches dock.
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

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || 300;
    this.height = rect.height || 100;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
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
    ctx.clearRect(0, 0, width, height);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.85)');
    bgGrad.addColorStop(1, 'rgba(30, 41, 59, 0.85)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = this.gateOpen ? 'rgba(56, 189, 248, 0.4)' : 'rgba(100, 116, 139, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 1. Oscilloscope waveform with zero-crossing search
    let startIndex = 0;
    for (let i = 0; i < this.audioData.length - 1; i++) {
      if (this.audioData[i] < 0 && this.audioData[i + 1] >= 0) {
        startIndex = i;
        break;
      }
    }

    const midY = height * 0.45;
    ctx.beginPath();
    ctx.strokeStyle = this.gateOpen ? '#38bdf8' : '#64748b';
    ctx.lineWidth = 1.5;

    const pointsToDraw = Math.min(256, this.audioData.length - startIndex);
    const sliceWidth = (width - 16) / pointsToDraw;

    for (let i = 0; i < pointsToDraw; i++) {
      const s = this.audioData[startIndex + i];
      const x = 8 + i * sliceWidth;
      const y = midY - s * (height * 0.35);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. RMS Level meter bar at bottom
    const meterY = height - 16;
    const meterHeight = 6;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(8, meterY, width - 16, meterHeight);

    const normRms = Math.min(1.0, this.rms * 8.0);
    const fillWidth = (width - 16) * normRms;
    ctx.fillStyle = this.gateOpen ? '#4ade80' : '#f59e0b';
    ctx.fillRect(8, meterY, fillWidth, meterHeight);

    // Gate threshold marker line (-46 dB ~ 0.005)
    const gateMarkerX = 8 + (width - 16) * (0.005 * 8.0);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gateMarkerX, meterY - 2);
    ctx.lineTo(gateMarkerX, meterY + meterHeight + 2);
    ctx.stroke();

    // 3. Active pitches badges on top right
    if (this.activePitches.length > 0) {
      let badgeX = width - 10;
      for (let i = this.activePitches.length - 1; i >= 0; i--) {
        const midi = this.activePitches[i];
        const noteName = midiToNoteName(midi);

        ctx.font = 'bold 11px "Inter", sans-serif';
        const textWidth = ctx.measureText(noteName).width;
        const boxWidth = textWidth + 12;
        badgeX -= boxWidth;

        ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, 8, boxWidth, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteName, badgeX + boxWidth / 2, 17);

        badgeX -= 6;
      }
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(this.gateOpen ? 'Listening...' : 'Gate Closed (< -46dB)', width - 10, 8);
    }
  }
}
