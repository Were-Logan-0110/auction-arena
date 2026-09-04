const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

function beep(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.stop(now + dur);
  } catch {
    /* ignore */
  }
}

export const sound = {
  resume() {
    if (ctx.state === "suspended") ctx.resume();
  },
  bid() {
    beep(660, 0.12, "square", 0.08);
  },
  win() {
    beep(523, 0.15, "sine", 0.2);
    setTimeout(() => beep(659, 0.15, "sine", 0.2), 120);
    setTimeout(() => beep(784, 0.25, "sine", 0.2), 240);
  },
  fold() {
    beep(200, 0.3, "sawtooth", 0.1);
  },
  reveal() {
    beep(880, 0.2, "triangle", 0.15);
    setTimeout(() => beep(1100, 0.2, "triangle", 0.12), 100);
  },
  goal() {
    const notes = [523, 659, 784, 1046, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.18), i * 110));
    setTimeout(() => beep(1046, 0.5, "square", 0.08), notes.length * 110);
  },
  whistle() {
    beep(2093, 0.12, "square", 0.07);
    setTimeout(() => beep(2093, 0.3, "square", 0.07), 160);
  },
  crowd() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => beep(120 + Math.random() * 300, 0.4, "sawtooth", 0.02), i * 180);
    }
  },
  tick() {
    beep(880, 0.05, "square", 0.05);
  },
};
