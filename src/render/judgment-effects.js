/**
 * judgment-effects.js
 * Particle bursts, floating rating toasts (PERFECT, GOOD, MISS), and hit glows.
 */

export class JudgmentEffects {
  constructor() {
    this.particles = [];
    this.toasts = [];
  }

  triggerHit(x, y, judgmentType) {
    const isPerfect = judgmentType === 'PERFECT';
    const baseColor = isPerfect ? '#38bdf8' : (judgmentType === 'GOOD' ? '#4ade80' : '#f87171');
    const particleCount = isPerfect ? 24 : 12;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = (isPerfect ? 3.5 : 2.5) + Math.random() * 3.0;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.025 + Math.random() * 0.02,
        color: baseColor,
        size: 3 + Math.random() * 3
      });
    }

    // Add toast
    this.toasts.push({
      x: x,
      y: y - 25,
      text: judgmentType,
      color: baseColor,
      life: 1.0,
      decay: 0.02,
      scale: 1.4
    });
  }

  triggerMiss(x, y) {
    this.toasts.push({
      x: x,
      y: y - 20,
      text: 'MISS',
      color: '#f87171',
      life: 1.0,
      decay: 0.025,
      scale: 1.2
    });
  }

  update() {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update toasts
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.y -= 0.6; // float upward
      t.scale = Math.max(1.0, t.scale - 0.02);
      t.life -= t.decay;
      if (t.life <= 0) {
        this.toasts.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();

    // Render particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render toasts
    for (const t of this.toasts) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.fillStyle = t.color;
      ctx.font = `bold ${Math.round(20 * t.scale)}px "Inter", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.fillText(t.text, t.x, t.y);
    }

    ctx.restore();
  }
}
