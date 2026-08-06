const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C 大调五声

function encodeWavDataUri(samples: Float32Array, sr: number): string {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);     // byteRate
  view.setUint16(32, 2, true);          // blockAlign
  view.setUint16(34, 16, true);         // bits
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export async function synthesizeDemoWav(seed: number, seconds = 12): Promise<{ src: string; duration: number }> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
  const pattern = (seed % 8) + 8;
  const noteDur = seconds / pattern;
  for (let i = 0; i < pattern; i++) {
    const f = SCALE[(seed + i * 2) % SCALE.length];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const t0 = i * noteDur;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.12, t0 + 0.02);          // attack
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + noteDur * 0.92); // decay（防爆音）
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + noteDur);
  }
  const rendered = await ctx.startRendering();
  return { src: encodeWavDataUri(rendered.getChannelData(0), sr), duration: seconds };
}
