import { HAND_CONNECTIONS, type Point } from './model.ts';
import type { HandLandmarker } from '@mediapipe/tasks-vision';

export type Hand = { id: number; label: string; points: Point[]; worldPoints?: Point[] };
type Track = { id: number; x: number; y: number };
export class HandCamera {
  private stream: MediaStream | null = null;
  private detector: HandLandmarker | null = null;
  private detectorPromise: Promise<HandLandmarker> | null = null;
  private generation = 0;
  private raf = 0;
  private lastVideoTime = -1;
  private lastDetect = 0;
  private tracks: Track[] = [];
  private nextId = 0;
  mirrored = true;
  active = false;
  busy = false;
  onHands: (hands: Hand[]) => void = () => {};
  onStatus: (message: string, state: 'off'|'loading'|'on'|'error') => void = () => {};
  onDevices: (devices: MediaDeviceInfo[], currentId: string) => void = () => {};
  constructor(public video: HTMLVideoElement, private canvas: HTMLCanvasElement) {
    navigator.mediaDevices?.addEventListener('devicechange', this.refreshDevices);
    window.addEventListener('pagehide', () => this.stop());
  }
  refreshDevices = async () => {
    try {
      const devices = (await navigator.mediaDevices?.enumerateDevices())?.filter(d => d.kind === 'videoinput') ?? [];
      this.onDevices(devices, this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? '');
    } catch { this.onDevices([], ''); }
  };
  private async loadDetector() {
    if (this.detector) return this.detector;
    if (this.detectorPromise) return this.detectorPromise;
    this.detectorPromise = (async () => {
      const {FilesetResolver, HandLandmarker} = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks('/wasm');
      const common = {runningMode: 'VIDEO' as const, numHands: 2, minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .55};
      try {
        return await HandLandmarker.createFromOptions(vision, {...common, baseOptions: {modelAssetPath: '/models/hand_landmarker.task', delegate: 'GPU'}});
      } catch {
        return await HandLandmarker.createFromOptions(vision, {...common, baseOptions: {modelAssetPath: '/models/hand_landmarker.task', delegate: 'CPU'}});
      }
    })();
    try { this.detector = await this.detectorPromise; return this.detector; }
    finally { this.detectorPromise = null; }
  }
  async start(deviceId?: string) {
    this.stop(false);
    const generation = ++this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.onStatus('Camera access requires HTTPS or localhost. Mouse and touch still work.', 'error'); return;
    }
    this.busy = true;
    this.onStatus('Please allow camera access…', 'loading');
    let candidate: MediaStream | null = null;
    try {
      candidate = await navigator.mediaDevices.getUserMedia({audio: false, video: {
        ...(deviceId ? {deviceId: {exact: deviceId}} : {facingMode: 'user'}),
        width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 24, max: 30}
      }});
      if (generation !== this.generation) { candidate.getTracks().forEach(t => t.stop()); return; }
      this.stream = candidate;
      this.video.srcObject = candidate;
      await this.video.play();
      if (generation !== this.generation) return;
      await this.refreshDevices();
      this.onStatus('Preparing on-device hand tracking…', 'loading');
      await this.loadDetector();
      if (generation !== this.generation) return;
      this.active = true; this.busy = false;
      this.stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (generation === this.generation) { this.stop(false); this.onStatus('Camera disconnected. Please select a device again.', 'error'); }
      });
      this.onStatus('Connected · Bring your hands into view', 'on');
      this.lastVideoTime = -1;
      this.tick();
    } catch (error) {
      candidate?.getTracks().forEach(t => t.stop());
      if (generation !== this.generation) return;
      this.stop(false);
      const name = (error as Error).name;
      const messages: Record<string,string> = {
        NotAllowedError: 'Camera permission is off. Allow access in your browser and try again.',
        NotFoundError: 'No camera found. Connect a device and retry, or use your mouse.',
        NotReadableError: 'Camera unavailable. Close other apps using it and try again.',
        OverconstrainedError: 'This camera is unavailable. Choose another device.',
        AbortError: 'The camera connection was interrupted. Please retry.'
      };
      this.onStatus(messages[name] ?? 'Hand tracking could not load. Check your connection and retry. Mouse and touch still work.', 'error');
      await this.refreshDevices();
    }
  }
  stop(notify = true) {
    ++this.generation;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video.pause(); this.video.srcObject = null;
    this.active = false; this.busy = false; this.tracks = [];
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onHands([]);
    if (notify) this.onStatus('Camera disabled', 'off');
  }
  setMirror(value: boolean) { this.mirrored = value; this.video.style.transform = value ? 'scaleX(-1)' : ''; this.tracks = []; this.onHands([]); }
  private tick = () => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    if (document.hidden || now - this.lastDetect < 55 || this.video.currentTime === this.lastVideoTime || this.video.readyState < 2) return;
    this.lastDetect = now; this.lastVideoTime = this.video.currentTime;
    try {
      const result = this.detector!.detectForVideo(this.video, now);
      const unmatched = [...this.tracks];
      const hands = result.landmarks.map((points, i) => {
        const p = points[0];
        let closest = -1, distance = .25;
        unmatched.forEach((t,j) => { const d = Math.hypot(t.x-p.x,t.y-p.y); if (d < distance) { distance=d; closest=j; } });
        const id = closest >= 0 ? unmatched.splice(closest,1)[0].id : this.nextId++;
        return { id, label: result.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left hand' : 'Right hand', points, worldPoints: result.worldLandmarks?.[i] };
      });
      this.tracks = hands.map(h => ({id:h.id,x:h.points[0].x,y:h.points[0].y}));
      this.draw(hands);
      this.onHands(hands);
    } catch {
      this.stop(false); this.onStatus('Hand tracking stopped. Please enable your camera again.', 'error');
    }
  };
  private draw(hands: Hand[]) {
    const {videoWidth:w,videoHeight:h} = this.video;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width=w; this.canvas.height=h; }
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0,0,w,h); ctx.save();
    if (this.mirrored) { ctx.translate(w,0); ctx.scale(-1,1); }
    ctx.strokeStyle='#aaf1dc'; ctx.fillStyle='#defff5'; ctx.lineWidth=2;
    ctx.shadowColor='#77e2cc'; ctx.shadowBlur=7;
    for (const hand of hands) {
      for (const [a,b] of HAND_CONNECTIONS) { ctx.beginPath(); ctx.moveTo(hand.points[a].x*w,hand.points[a].y*h); ctx.lineTo(hand.points[b].x*w,hand.points[b].y*h); ctx.stroke(); }
      for (const p of hand.points) { ctx.beginPath(); ctx.arc(p.x*w,p.y*h,3,0,Math.PI*2); ctx.fill(); }
    }
    ctx.restore();
  }
}
