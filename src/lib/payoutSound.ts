let audioContext: AudioContext | null = null;
let primed = false;
let audioUnlocked = false;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) return null;
  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }

  return audioContext;
}

async function unlockAudioContext() {
  const context = getAudioContext();
  if (!context) return false;

  if (context.state === "suspended") {
    await context.resume();
  }

  const running = context.state === "running";
  if (running) {
    audioUnlocked = true;
  }

  return running;
}

function seedSilentUnlockTone() {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.00001, context.currentTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + 0.02);
}

export function primePayoutAudio() {
  if (typeof window === "undefined" || primed) return;
  primed = true;

  const tryUnlock = () => {
    void unlockAudioContext().finally(() => {
      const context = getAudioContext();
      if (context?.state === "running") {
        seedSilentUnlockTone();
        window.removeEventListener("pointerdown", tryUnlock);
        window.removeEventListener("click", tryUnlock);
        window.removeEventListener("keydown", tryUnlock);
        window.removeEventListener("touchstart", tryUnlock);
      }
    });
  };

  window.addEventListener("pointerdown", tryUnlock, { passive: true });
  window.addEventListener("click", tryUnlock, { passive: true });
  window.addEventListener("keydown", tryUnlock, { passive: true });
  window.addEventListener("touchstart", tryUnlock, { passive: true });
}

export async function playPayoutChime() {
  const context = getAudioContext();
  if (!context) return false;

  const unlocked = await unlockAudioContext();
  if (!unlocked) return false;

  audioUnlocked = true;

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  master.connect(context.destination);

  const notes = [
    { frequency: 587.33, start: 0, duration: 0.22 },
    { frequency: 783.99, start: 0.1, duration: 0.24 },
    { frequency: 1046.5, start: 0.24, duration: 0.5 },
  ];

  notes.forEach((note, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === notes.length - 1 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
    oscillator.connect(gain);
    gain.connect(master);
    gain.gain.setValueAtTime(0.0001, now + note.start);
    gain.gain.exponentialRampToValueAtTime(0.7, now + note.start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
    oscillator.start(now + note.start);
    oscillator.stop(now + note.start + note.duration + 0.03);
  });

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.([90, 45, 120]);
  }

  return true;
}

export function isPayoutAudioReady() {
  const context = getAudioContext();
  return Boolean(audioUnlocked && context?.state === "running");
}
