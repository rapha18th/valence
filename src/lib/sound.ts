// Tiny WebAudio feedback. Off by default; gated by store.sound.

import { getState } from "../store/store.ts";

let ctx: AudioContext | null = null;
function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
  if (!getState().sound) return;
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g).connect(a.destination);
    const t = a.currentTime;
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch { /* ignore */ }
}

export const sfx = {
  key: () => blip(420, 0.055, 0.035, "square"),
  select: () => { blip(587.33, 0.05, 0.04, "triangle"); setTimeout(() => blip(880, 0.08, 0.035, "triangle"), 40); },
  confirm: () => { blip(523.25, 0.11, 0.05); setTimeout(() => blip(659.25, 0.11, 0.045), 80); setTimeout(() => blip(783.99, 0.18, 0.04), 160); },
  no: () => { blip(300, 0.09, 0.045, "sawtooth"); setTimeout(() => blip(196, 0.16, 0.04, "sawtooth"), 70); },
  agent: () => blip(300, 0.045, 0.028, "sawtooth"),
};
