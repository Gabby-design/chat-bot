/**
 * TypewriterStreamer
 * Adaptive, high-performance character-by-character text streamer for AI responses.
 * Provides a fluid typing animation in real-time without slowing down overall generation.
 */

export class TypewriterStreamer {
  constructor({ onUpdate, onComplete, minCharsPerFrame = 1 }) {
    this.targetText = '';
    this.displayedText = '';
    this.displayedLength = 0;
    this.onUpdate = onUpdate || (() => {});
    this.onComplete = onComplete || (() => {});
    this.minCharsPerFrame = minCharsPerFrame;
    this.isStreamFinished = false;
    this.isRunning = false;
    this.rafId = null;
    this.lastTickTime = 0;
  }

  append(token) {
    if (!token) return;
    this.targetText += token;
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTickTime = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  reset() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.targetText = '';
    this.displayedText = '';
    this.displayedLength = 0;
    this.isStreamFinished = false;
    this.isRunning = false;
    this.onUpdate('');
  }

  finish() {
    this.isStreamFinished = true;
    if (!this.isRunning && this.displayedLength < this.targetText.length) {
      this.isRunning = true;
      this.rafId = requestAnimationFrame(this.tick);
    } else if (!this.isRunning && this.displayedLength >= this.targetText.length) {
      this.onComplete(this.targetText);
    }
  }

  flush() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
    this.displayedLength = this.targetText.length;
    this.displayedText = this.targetText;
    this.onUpdate(this.targetText);
    this.onComplete(this.targetText);
  }

  abort() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
  }

  tick = (now) => {
    if (!this.isRunning) return;

    const remaining = this.targetText.length - this.displayedLength;

    if (remaining > 0) {
      // Dynamic pacing: scales up so it never lags behind fast network bursts
      let step = this.minCharsPerFrame;
      if (remaining > 80) {
        step = Math.ceil(remaining / 6);
      } else if (remaining > 40) {
        step = 5;
      } else if (remaining > 20) {
        step = 3;
      } else if (remaining > 8) {
        step = 2;
      } else {
        step = 1;
      }

      this.displayedLength = Math.min(this.targetText.length, this.displayedLength + step);
      this.displayedText = this.targetText.slice(0, this.displayedLength);
      this.onUpdate(this.displayedText);

      this.rafId = requestAnimationFrame(this.tick);
    } else {
      if (this.isStreamFinished) {
        this.isRunning = false;
        this.rafId = null;
        this.onComplete(this.targetText);
      } else {
        // Paused waiting for the next incoming token from the network
        this.isRunning = false;
        this.rafId = null;
      }
    }
  };
}
