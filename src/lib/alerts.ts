// Lightweight new-order alert: short beep via WebAudio + device vibration.
// No external assets — works offline.

let cachedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!cachedCtx) cachedCtx = new Ctor();
  return cachedCtx;
}

/** Call once after a user gesture (e.g. clicking the sound toggle) to unlock audio on iOS/Safari. */
export async function unlockAlertSound(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

export function playNewOrderAlert(opts: { sound?: boolean; vibrate?: boolean } = {}): void {
  const { sound = true, vibrate = true } = opts;

  if (sound) {
    const ctx = getCtx();
    if (ctx) {
      try {
        if (ctx.state === "suspended") void ctx.resume();
        const now = ctx.currentTime;
        // Two-tone "ping ping"
        const tones = [
          { freq: 880, start: now, dur: 0.18 },
          { freq: 1175, start: now + 0.22, dur: 0.22 },
        ];
        for (const t of tones) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = t.freq;
          gain.gain.setValueAtTime(0.0001, t.start);
          gain.gain.exponentialRampToValueAtTime(0.35, t.start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t.start + t.dur);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t.start);
          osc.stop(t.start + t.dur + 0.02);
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([120, 60, 120, 60, 200]);
    } catch {
      /* ignore */
    }
  }
}
