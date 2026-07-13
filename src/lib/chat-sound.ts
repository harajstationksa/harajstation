/**
 * The incoming-message chime.
 *
 * Synthesised rather than shipped as a file: it is two short sine tones, so a
 * WAV/MP3 would be a needless download and one more asset to cache-bust. It also
 * means the sound can never be missing.
 *
 * Browsers refuse to play audio until the user has interacted with the page, so
 * the context is created lazily and resumed on the first gesture — until then
 * play() is a no-op rather than an error.
 */
const MUTE_KEY = "chat-muted";

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Call from any click/keypress so the chime is allowed to sound later. */
export function unlockChatSound() {
  audioContext()?.resume().catch(() => {});
}

export function isChatMuted() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setChatMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function playIncomingChime() {
  if (isChatMuted()) return;
  const audio = audioContext();
  if (!audio || audio.state !== "running") return;

  // a rising two-note blip: quiet, short, and unmistakably "a message arrived"
  const now = audio.currentTime;
  for (const [i, freq] of [660, 880].entries()) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    const start = now + i * 0.09;
    const end = start + 0.13;
    // ramp the volume instead of switching it — a hard start/stop clicks
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.09, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
