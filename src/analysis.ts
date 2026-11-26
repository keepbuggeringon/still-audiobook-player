export type Interval = [number, number];
export type Strength = 'off' | 'conservative' | 'balanced' | 'strong';
export const profiles = {
  conservative: { db: -48, minimum: 1.2, padding: .30 },
  balanced: { db: -43, minimum: .9, padding: .22 },
  strong: { db: -38, minimum: .45, padding: .12 },
} as const;
export type Maps = Record<Exclude<Strength, 'off'>, Interval[]>;
export const emptyMaps = (): Maps => ({ conservative: [], balanced: [], strong: [] });

// 20ms windows use the loudest channel's RMS. Opposing stereo phases cannot cancel speech.
export class QuietDetector {
  maps = emptyMaps();
  private active: Record<string, number | null> = { conservative: null, balanced: null, strong: null };
  private sums: number[] = [];
  private count = 0;
  private start = 0;
  private lastEnd = 0;
  private rate = 0;
  push(channels: Float32Array[], rate: number, timestamp: number) {
    if (!channels.length || rate <= 0 || channels.some(c => c.length !== channels[0].length)) throw Error('Invalid PCM frame');
    if (this.rate && (this.rate !== rate || Math.abs(timestamp - this.lastEnd) > .05)) {
      this.flush(this.lastEnd); this.count = 0; this.sums = [];
    }
    this.rate = rate;
    const size = Math.max(1, Math.round(rate * .02));
    if (this.sums.length !== channels.length) this.sums = channels.map(() => 0);
    for (let i = 0; i < channels[0].length; i++) {
      if (!this.count) this.start = timestamp + i / rate;
      for (let c = 0; c < channels.length; c++) this.sums[c] += channels[c][i] ** 2;
      this.count++;
      if (this.count === size) {
        const db = 10 * Math.log10(Math.max(1e-12, ...this.sums.map(v => v / size)));
        const end = timestamp + (i + 1) / rate;
        for (const [name, p] of Object.entries(profiles)) {
          if (db <= p.db) this.active[name] ??= Math.max(0, this.start);
          else this.close(name as keyof Maps, this.start);
        }
        this.lastEnd = end; this.count = 0; this.sums.fill(0);
      }
    }
    this.lastEnd = timestamp + channels[0].length / rate;
  }
  private close(name: keyof Maps, end: number) {
    const start = this.active[name];
    if (start !== null && end - start >= profiles[name].minimum) this.maps[name].push([start, end]);
    this.active[name] = null;
  }
  flush(end = this.lastEnd) {
    // Do not classify a partial trailing window as quiet.
    for (const name of Object.keys(profiles) as (keyof Maps)[]) this.close(name, this.count ? this.start : end);
  }
  checkpointTime() {
    return Math.max(0, Math.min(this.count ? this.start : this.lastEnd, ...Object.values(this.active).filter((n): n is number => n !== null)));
  }
}

export function skipTarget(maps: Maps, strength: Strength, time: number): number | null {
  if (strength === 'off') return null;
  const list = maps[strength], pad = profiles[strength].padding;
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid][1] <= time) lo = mid + 1; else hi = mid; }
  const interval = list[lo];
  return interval && time >= interval[0] && time < interval[1] - pad - .08 ? interval[1] - pad : null;
}

export function diagnosticSource() {
  // Generated test only: two minutes, 8 kHz mono, <2 MB. Nothing is written to storage.
  const rate = 8000, seconds = 120, bytes = new ArrayBuffer(44 + rate * seconds * 2), v = new DataView(bytes);
  const str = (offset: number, s: string) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, bytes.byteLength - 44, true);
  for (let i = 0; i < rate * seconds; i++) {
    const phase = i / rate % 10;
    const envelope = phase < 4 ? Math.min(1, phase / .04, (4 - phase) / .04) : 0;
    v.setInt16(44 + i * 2, Math.round(Math.sin(i / rate * Math.PI * 880) * 3500 * envelope), true);
  }
  const maps = emptyMaps();
  for (let t = 4; t < seconds; t += 10) for (const m of Object.values(maps)) m.push([t, t + 6]);
  return { blob: new Blob([bytes], { type: 'audio/wav' }), maps, seconds };
}
