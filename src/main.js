/**
 * main.js
 * Lead Systems Architect Coordinator & Lifecycle Bootstrap.
 * Connects Web Audio, Inference, Grand Staff Highway, Scoring, and HUD.
 */

import { AudioManager } from './audio/audio-manager.js';
import { AudioCapture } from './audio/audio-capture.js';
import { InferenceService } from './inference/inference-service.js';
import { LevelLoader } from './gameplay/level-loader.js';
import { ScoringService } from './gameplay/scoring-service.js';
import { HighwayRenderer } from './render/highway-renderer.js';
import { OscilloscopeView } from './render/oscilloscope-view.js';
import { HudController } from './ui/hud-controller.js';
import { CalibrationModal } from './ui/calibration-modal.js';
import { SongSelector } from './ui/song-selector.js';

class GameApp {
  constructor() {
    this.audioManager = new AudioManager();
    this.audioCapture = new AudioCapture(this.audioManager.ctx);
    this.inferenceService = new InferenceService(this.audioManager.ctx.sampleRate);
    this.scoringService = new ScoringService();
    this.hud = new HudController();

    this.currentSong = null;
    this.highway = null;
    this.oscilloscope = null;
    this.calibrationModal = null;
    this.songSelector = null;

    this.metronomeActive = false;
    this.lastMetronomeBeat = -1;

    // Key map for PC keyboard chord testing
    this.keyToMidi = {
      KeyA: 60, // C4
      KeyW: 61, // C#4
      KeyS: 62, // D4
      KeyE: 63, // D#4
      KeyD: 64, // E4
      KeyF: 65, // F4
      KeyT: 66, // F#4
      KeyG: 67, // G4
      KeyY: 68, // G#4
      KeyH: 69, // A4
      KeyU: 70, // A#4
      KeyJ: 71, // B4
      KeyK: 72, // C5
      KeyO: 73, // C#5
      KeyL: 74  // D5
    };
  }

  async init() {
    const appRoot = document.getElementById('app');

    // 1. Mount HUD layout
    this.hud.mount(appRoot);

    // 2. Setup Highway Canvas
    const highwayMount = document.getElementById('highway-mount-point');
    const highwayCanvas = document.createElement('canvas');
    highwayCanvas.className = 'highway-canvas';
    highwayMount.appendChild(highwayCanvas);
    this.highway = new HighwayRenderer(highwayCanvas);

    // 3. Setup Oscilloscope Canvas
    const oscCanvas = document.getElementById('oscilloscope-canvas');
    this.oscilloscope = new OscilloscopeView(oscCanvas);

    // 4. Modals
    this.calibrationModal = new CalibrationModal(this.audioManager, this.inferenceService);
    this.calibrationModal.mount(appRoot);

    this.songSelector = new SongSelector((selectedSong) => this.loadSong(selectedSong));
    this.songSelector.mount(appRoot);

    // 5. Wire AudioCapture & Inference Pipeline
    await this.audioCapture.initialize();
    await this.inferenceService.initialize();

    // Wire model status badges to HUD
    this.inferenceService.onModelStatusChange((statusInfo) => {
      this.hud.updateModelStatus(statusInfo);
    });

    // Initial audio input devices enumeration
    const devices = await this.audioCapture.getAudioInputDevices();
    this.hud.populateAudioDevices(devices);
    this.audioCapture.deviceChangeListeners.add((updatedDevices) => {
      this.hud.populateAudioDevices(updatedDevices);
    });

    // Stream audio chunks to inference and oscilloscope
    this.audioCapture.onAudioChunk((chunk, meta) => {
      this.inferenceService.processAudioChunk(chunk, meta);
      this.oscilloscope.updateAudio(chunk, meta.rms, meta.gateOpen);
    });

    // Update active detected pitches on highway and oscilloscope
    this.inferenceService.onActivePitchesChange((pitches) => {
      this.highway.setActivePitches(pitches);
      this.oscilloscope.setActivePitches(pitches);
    });

    // Handle note detections for rhythm scoring
    this.inferenceService.onNoteOn((event) => {
      this.handlePitchHit(event.midi);
    });

    // Handle scoring events
    this.scoringService.onJudgment((event) => {
      if (event.type === 'MISS') {
        this.highway.triggerMissEffect(event.note);
      } else {
        this.highway.triggerHitEffect(event.note, event.type);
      }
    });

    this.scoringService.onScoreChange((scoreData) => {
      this.hud.updateScore(scoreData);
    });

    // 6. Bind HUD Events
    this.bindHudEvents();
    this.bindKeyboardControls();

    // 7. Load default song: Ode to Joy
    await this.loadSong(LevelLoader.getBundledSong('piece_1_monophonic'));

    // 8. Start 60/120 FPS Main Loop
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  bindHudEvents() {
    this.hud.on('play', () => this.togglePlay());
    this.hud.on('restart', () => this.restartSong());
    this.hud.on('speedChange', (speed) => {
      this.audioManager.setPlaybackRate(speed);
      this.highway.setScrollSpeed(240 * speed);
    });
    this.hud.on('presetChange', (presetKey) => {
      this.inferenceService.setPreset(presetKey);
    });
    this.hud.on('toggleMetronome', (active) => {
      this.metronomeActive = active;
    });
    this.hud.on('toggleMic', () => this.toggleMicrophone());
    this.hud.on('selectDevice', async (deviceId) => {
      await this.audioCapture.switchDevice(deviceId);
      if (this.audioCapture.isCapturing) {
        this.hud.setMicState('Mic: Active', true);
      }
    });
    this.hud.on('openCalibrate', () => this.calibrationModal.show());
    this.hud.on('openSongSelector', () => this.songSelector.show());

    this.hud.on('keyTrigger', ({ midi, type }) => {
      if (type === 'down') {
        this.inferenceService.triggerNote(midi, 0.85);
        this.audioManager.playTone(midi, 0.4, 0.5);
      } else {
        this.inferenceService.releaseNote(midi);
      }
    });
  }

  bindKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      // Don't capture when typing in text/number inputs
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
        return;
      }

      const midi = this.keyToMidi[e.code];
      if (midi && !e.repeat) {
        this.inferenceService.triggerNote(midi, 0.85);
        this.audioManager.playTone(midi, 0.4, 0.5);

        // Highlight virtual key
        const keyEl = document.querySelector(`.piano-key[data-midi="${midi}"]`);
        if (keyEl) keyEl.classList.add('pressed');
      }
    });

    window.addEventListener('keyup', (e) => {
      const midi = this.keyToMidi[e.code];
      if (midi) {
        this.inferenceService.releaseNote(midi);
        const keyEl = document.querySelector(`.piano-key[data-midi="${midi}"]`);
        if (keyEl) keyEl.classList.remove('pressed');
      }
    });
  }

  async toggleMicrophone() {
    if (this.audioCapture.isCapturing) {
      this.audioCapture.stopCapture();
      this.hud.setMicState('Mic: Stopped', false);
    } else {
      try {
        await this.audioManager.ensureRunning();
        await this.audioCapture.startCapture();
        this.hud.setMicState('Mic: Active', true);

        // Re-enumerate audio devices now that microphone permissions are granted (labels are now unlocked)
        const devices = await this.audioCapture.getAudioInputDevices();
        this.hud.populateAudioDevices(devices);
      } catch (err) {
        alert('Microphone permission denied or not available. You can use Virtual Keys / PC Keyboard.');
        this.hud.setMicState('Mic: Denied', false);
      }
    }
  }

  async loadSong(song) {
    this.audioManager.stop();
    this.currentSong = song;

    // Reset notes judgment state
    this.currentSong.notes.forEach((n) => (n.judged = false));
    this.scoringService.reset();
    this.scoringService.setTotalNotes(song.notes.length);

    this.hud.setSongInfo(song.title, song.artist);
    this.hud.setPlayState(false);
    this.hud.updateScore({
      score: 0,
      combo: 0,
      multiplier: 1,
      accuracy: 100.0
    });

    this.highway.setSong(this.currentSong);

    if (song.audioUrl) {
      await this.audioManager.loadBackingTrack(song.audioUrl);
    } else {
      this.audioManager.backingBuffer = null;
    }
  }

  togglePlay() {
    if (this.audioManager.isPlaying) {
      this.audioManager.pause();
      this.hud.setPlayState(false);
    } else {
      const current = this.audioManager.getPlayheadTime();
      if (current >= this.currentSong.totalDuration) {
        this.restartSong();
      } else {
        this.audioManager.play(current);
        this.hud.setPlayState(true);
      }
    }
  }

  restartSong() {
    this.audioManager.stop();
    this.currentSong.notes.forEach((n) => (n.judged = false));
    this.scoringService.reset();
    this.scoringService.setTotalNotes(this.currentSong.notes.length);
    this.hud.updateScore({
      score: 0,
      combo: 0,
      multiplier: 1,
      accuracy: 100.0
    });
    this.audioManager.play(0);
    this.hud.setPlayState(true);
  }

  handlePitchHit(midi) {
    if (!this.currentSong) return;
    const playhead = this.audioManager.getPlayheadTime();
    this.scoringService.evaluateInput(midi, playhead, this.currentSong.notes);
  }

  gameLoop(timestamp) {
    const playhead = this.audioManager.getPlayheadTime();

    if (this.audioManager.isPlaying && this.currentSong) {
      // Check for missed notes
      this.scoringService.checkMissedNotes(playhead, this.currentSong.notes);

      // Metronome sync
      if (this.metronomeActive && this.currentSong.bpm) {
        const beatDuration = 60.0 / this.currentSong.bpm;
        const currentBeat = Math.floor(playhead / beatDuration);
        if (currentBeat !== this.lastMetronomeBeat && currentBeat >= 0) {
          this.lastMetronomeBeat = currentBeat;
          this.audioManager.playMetronomeClick(currentBeat % 4 === 0);
        }
      }

      // Procedural audio note playback if no audio file
      if (!this.audioManager.backingBuffer) {
        for (const n of this.currentSong.notes) {
          if (!n.synthPlayed && playhead >= n.time && playhead <= n.time + 0.1) {
            n.synthPlayed = true;
            this.audioManager.playTone(n.midi, n.duration, 0.45);
          }
        }
      }

      // Check song end
      if (playhead >= this.currentSong.totalDuration) {
        this.audioManager.stop();
        this.hud.setPlayState(false);
      }

      this.hud.updateProgress(playhead, this.currentSong.totalDuration);
    }

    // Render 60/120 FPS graphics
    this.highway.render(playhead);
    this.oscilloscope.render();

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Bootstrap application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new GameApp();
  app.init().catch(console.error);
});
