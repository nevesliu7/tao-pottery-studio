export const RINGS = 65;
export const SEGMENTS = 96;
export const HEIGHT = 2.65;
export const WALL = 0.105;
export const BASE = 0.13;
export const PALETTE = [
  { name: 'Moon white', english: 'Moon white', hex: '#ddd3bb' },
  { name: 'Celadon', english: 'Celadon', hex: '#86a59b' },
  { name: 'Terracotta', english: 'Terracotta', hex: '#bc8067' },
  { name: 'Mist blue', english: 'Mist blue', hex: '#7d96ab' },
  { name: 'Wheat', english: 'Wheat', hex: '#c6a76c' },
  { name: 'Ink stone', english: 'Ink stone', hex: '#626b68' },
];
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export function linearColor(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map(x => {
    const s = x / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  }) as [number, number, number];
}
export type Snapshot = { profile: number[]; colors: number[] };
export class ClayModel {
  profile = new Float32Array(RINGS);
  colors = new Float32Array(RINGS * SEGMENTS * 3);
  revision = 0;
  shapeRevision = 0;
  constructor() { this.reset(); }
  reset() {
    this.shapeRevision++;
    for (let i = 0; i < RINGS; i++) {
      const t = i / (RINGS - 1);
      this.profile[i] = .61 + .35 * Math.exp(-(((t - .38) / .28) ** 2)) + .07 * Math.exp(-(((t - 1) / .07) ** 2));
    }
    this.fill(linearColor(PALETTE[0].hex));
  }
  radiusAt(y: number) {
    const f = clamp(y / HEIGHT, 0, 1) * (RINGS - 1);
    const i = Math.floor(f);
    return this.profile[i] + (this.profile[Math.min(i + 1, RINGS - 1)] - this.profile[i]) * (f - i);
  }
  shape(y: number, delta: number, size: number) {
    if (!Number.isFinite(delta) || !Number.isFinite(y) || Math.abs(delta) < .0001) return false;
    delta = clamp(delta, -.055, .055);
    for (let i = 0; i < RINGS; i++) {
      const h = HEIGHT * i / (RINGS - 1);
      const w = Math.exp(-(((h - y) / size) ** 2) * 2);
      // Preserve a stable foot and a safe cavity; no inverted walls.
      const foot = clamp(i / 5, 0, 1);
      this.profile[i] = clamp(this.profile[i] + delta * w * foot, .32, 1.38);
    }
    // Bound adjacent slopes so aggressive repeated pulls cannot fold the wall.
    for (let i = 1; i < RINGS; i++) this.profile[i] = clamp(this.profile[i], this.profile[i-1] - .085, this.profile[i-1] + .085);
    for (let i = RINGS - 2; i >= 1; i--) this.profile[i] = clamp(this.profile[i], this.profile[i+1] - .085, this.profile[i+1] + .085);
    this.revision++; this.shapeRevision++;
    return true;
  }
  paint(y: number, angle: number, color: number[], size: number, opacity = .26) {
    let changed = false;
    for (let i = 0; i < RINGS; i++) {
      const dy = (i / (RINGS - 1) * HEIGHT - y) / size;
      if (Math.abs(dy) > 2) continue;
      for (let j = 0; j < SEGMENTS; j++) {
        const a = j / SEGMENTS * Math.PI * 2;
        const da = Math.atan2(Math.sin(a - angle), Math.cos(a - angle)) * this.profile[i] / size;
        const weight = Math.exp(-(dy * dy + da * da) * 2) * opacity;
        if (weight < .002) continue;
        const k = (i * SEGMENTS + j) * 3;
        for (let c = 0; c < 3; c++) this.colors[k+c] += (color[c] - this.colors[k+c]) * weight;
        changed = true;
      }
    }
    if (changed) this.revision++;
    return changed;
  }
  fill(color: number[]) {
    for (let i = 0; i < this.colors.length; i++) this.colors[i] = color[i % 3];
    this.revision++;
  }
  snapshot(): Snapshot { return {profile: Array.from(this.profile), colors: Array.from(this.colors)}; }
  restore(s: Snapshot) {
    if (s.profile.length !== RINGS || s.colors.length !== RINGS * SEGMENTS * 3) throw new Error('Invalid clay snapshot');
    this.profile.set(s.profile); this.colors.set(s.colors); this.revision++; this.shapeRevision++;
  }
}
export type Point = { x: number; y: number; z: number };
export const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export function pinchRatio(p: Point[]) {
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  return distance(p[4], p[8]) / Math.max(distance(p[0], p[9]), .015);
}
export function mirroredPoint(p: Point, mirrored: boolean): Point {
  return { x: mirrored ? 1 - p.x : p.x, y: p.y, z: p.z };
}
export class History {
  private stack: Snapshot[] = [];
  private pending: Snapshot | null = null;
  constructor(private model: ClayModel) {}
  begin() { if (!this.pending) this.pending = this.model.snapshot(); }
  commit() {
    if (!this.pending) return;
    const p = this.pending;
    this.pending = null;
    if (p.profile.some((v,i) => v !== this.model.profile[i]) || p.colors.some((v,i) => v !== this.model.colors[i])) {
      this.stack.push(p); if(this.stack.length > 24) this.stack.shift();
    }
  }
  undo() { this.commit(); const s = this.stack.pop(); if (s) this.model.restore(s); return !!s; }
  get length() { return this.stack.length; }
}
