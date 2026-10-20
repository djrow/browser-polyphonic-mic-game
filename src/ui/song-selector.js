/**
 * song-selector.js
 * Song selection dropdown/modal and custom file drag & drop zone.
 */

import { BUNDLED_SONGS, LevelLoader } from '../gameplay/level-loader.js';
import { OmrProcessor } from '../gameplay/omr-processor.js';

export class SongSelector {
  constructor(onSongSelected) {
    this.onSongSelected = onSongSelected;
    this.container = null;
    this.isOpen = false;
  }

  mount(rootElement) {
    const songListHtml = BUNDLED_SONGS.map(
      (s) => `
      <div class="song-card" data-song-id="${s.id}">
        <div class="song-info">
          <div class="song-title">${s.title}</div>
          <div class="song-meta">${s.artist} &bull; ${s.difficulty} &bull; ${s.bpm} BPM &bull; ${s.notes.length} notes</div>
        </div>
        <button class="btn select-song-btn">Play</button>
      </div>
    `
    ).join('');

    const modalHtml = `
      <div id="song-modal" class="modal-overlay hidden">
        <div class="modal-card">
          <div class="modal-header">
            <h3>🎵 Select Song or Import Chart</h3>
            <button id="song-close-btn" class="close-btn" title="Close">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Bundled Songs -->
            <div class="modal-section">
              <h4>Bundled Master Charts</h4>
              <div class="song-list">
                ${songListHtml}
              </div>
            </div>

            <!-- Custom File Dropzone -->
            <div class="modal-section">
              <h4>Drop Custom Chart or Sheet Music</h4>
              <p class="section-desc">Supports MIDI (<code>.mid</code>, <code>.midi</code>), JSON charts (<code>.json</code>), or Sheet Music images (<code>.png</code>, <code>.jpg</code>) parsed via Integral Image OMR.</p>
              
              <div id="drop-zone" class="drop-zone">
                <div class="drop-icon">📂</div>
                <div class="drop-text">Drag & drop files here, or <span class="browse-link">browse</span></div>
                <input type="file" id="file-input" accept=".mid,.midi,.json,.png,.jpg,.jpeg" style="display: none;">
                <div id="import-status" class="import-status"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    rootElement.insertAdjacentHTML('beforeend', modalHtml);
    this.container = document.getElementById('song-modal');
    this.bindEvents();
  }

  bindEvents() {
    const closeBtn = document.getElementById('song-close-btn');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    closeBtn.addEventListener('click', () => this.hide());
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.hide();
    });

    // Bundled song clicks
    const songCards = this.container.querySelectorAll('.song-card');
    songCards.forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.songId;
        const song = LevelLoader.getBundledSong(id);
        this.onSongSelected(song);
        this.hide();
      });
    });

    // File input & Drag drop
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFile(e.target.files[0]);
      }
    });
  }

  async handleFile(file) {
    const statusEl = document.getElementById('import-status');
    statusEl.textContent = `Loading ${file.name}...`;

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let song = null;

      if (ext === 'mid' || ext === 'midi') {
        const buffer = await file.arrayBuffer();
        song = await LevelLoader.parseMidiFile(buffer, file.name);
      } else if (ext === 'json') {
        const text = await file.text();
        song = LevelLoader.parseJsonChart(text, file.name);
      } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
        statusEl.textContent = 'Analyzing sheet music with Integral Image OMR...';
        song = await OmrProcessor.processImage(file);
      } else {
        throw new Error('Unsupported file extension: ' + ext);
      }

      statusEl.innerHTML = `✅ Successfully imported <strong>${song.title}</strong> (${song.notes.length} notes)`;
      setTimeout(() => {
        this.onSongSelected(song);
        this.hide();
      }, 700);
    } catch (err) {
      console.error(err);
      statusEl.innerHTML = `<span style="color: #f87171">❌ Failed to import: ${err.message}</span>`;
    }
  }

  show() {
    if (!this.container) return;
    this.container.classList.remove('hidden');
    this.isOpen = true;
  }

  hide() {
    if (!this.container) return;
    this.container.classList.add('hidden');
    this.isOpen = false;
  }
}
