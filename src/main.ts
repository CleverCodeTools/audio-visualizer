type BlendMode = 'normal' | Exclude<GlobalCompositeOperation, 'source-over'>;

type RGB = [number, number, number];

type VisualizerOptions = {
  smoothing: number;
  fft: number;
  minDecibels: number;
  glow: number;
  fillOpacity: number;
  lineWidth: number;
  blend: BlendMode;
  shift: number;
  width: number;
  amp: number;
  color1: RGB;
  color2: RGB;
  color3: RGB;
};

const WIDTH = 1000;
const HEIGHT = 400;

const opts: VisualizerOptions = {
  smoothing: 0.6,
  fft: 8,
  minDecibels: -70,
  glow: 10,
  fillOpacity: 0.6,
  lineWidth: 1,
  blend: 'screen',
  shift: 50,
  width: 60,
  amp: 1,
  color1: [203, 36, 128],
  color2: [41, 200, 192],
  color3: [24, 137, 218]
};

const shuffle = [1, 3, 0, 4, 2] as const;

const byId = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const clampMin = (n: number, min: number) => (n < min ? min : n);

const getColor = (channel: 0 | 1 | 2) => {
  const key = (['color1', 'color2', 'color3'] as const)[channel];
  return opts[key].map(Math.floor) as RGB;
};

const createGui = () => {
  const gui = new dat.GUI();
  gui.close();

  gui.addColor(opts, 'color1');
  gui.addColor(opts, 'color2');
  gui.addColor(opts, 'color3');
  gui.add(opts, 'fillOpacity', 0, 1);
  gui.add(opts, 'lineWidth', 0, 10, 1);
  gui.add(opts, 'glow', 0, 100);
  gui.add(opts, 'blend', [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'lighten',
    'difference'
  ]);

  gui.add(opts, 'smoothing', 0, 1);
  gui.add(opts, 'minDecibels', -100, 0);
  gui.add(opts, 'amp', 0, 5);
  gui.add(opts, 'width', 0, 60);
  gui.add(opts, 'shift', 0, 200);
};

class AudioVisualizer {
  private readonly ctx: CanvasRenderingContext2D;
  private audio?: AudioContext;
  private analyser?: AnalyserNode;
  private freqs?: Uint8Array<ArrayBuffer>;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  async start() {
    const AudioContextCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    this.audio = new AudioContextCtor();
    this.analyser = this.audio.createAnalyser();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const input = this.audio.createMediaStreamSource(stream);
    input.connect(this.analyser);

    this.freqs = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    requestAnimationFrame(this.visualize);
  }

  private freq = (channel: 0 | 1 | 2, i: 0 | 1 | 2 | 3 | 4) => {
    const band = 2 * channel + shuffle[i] * 6;
    return this.freqs?.[band] ?? 0;
  };

  private scale = (i: 0 | 1 | 2 | 3 | 4) => {
    const x = Math.abs(2 - i);
    const s = 3 - x;
    return (s / 3) * opts.amp;
  };

  private path = (channel: 0 | 1 | 2) => {
    const ctx = this.ctx;
    const color = getColor(channel);

    ctx.fillStyle = `rgba(${color}, ${opts.fillOpacity})`;
    ctx.strokeStyle = ctx.shadowColor = `rgb(${color})`;

    ctx.lineWidth = opts.lineWidth;
    ctx.shadowBlur = opts.glow;
    ctx.globalCompositeOperation =
      opts.blend === 'normal' ? 'source-over' : (opts.blend satisfies GlobalCompositeOperation);

    const m = HEIGHT / 2;
    const offset = (WIDTH - 15 * opts.width) / 2;

    const x = Array.from({ length: 15 }, (_, i) => offset + channel * opts.shift + i * opts.width);
    const y = Array.from({ length: 5 }, (_, i) =>
      clampMin(m - this.scale(i as 0 | 1 | 2 | 3 | 4) * this.freq(channel, i as 0 | 1 | 2 | 3 | 4), 0)
    );
    const h = 2 * m;

    ctx.beginPath();
    ctx.moveTo(0, m);
    ctx.lineTo(x[0], m + 1);

    ctx.bezierCurveTo(x[1], m + 1, x[2], y[0], x[3], y[0]);
    ctx.bezierCurveTo(x[4], y[0], x[4], y[1], x[5], y[1]);
    ctx.bezierCurveTo(x[6], y[1], x[6], y[2], x[7], y[2]);
    ctx.bezierCurveTo(x[8], y[2], x[8], y[3], x[9], y[3]);
    ctx.bezierCurveTo(x[10], y[3], x[10], y[4], x[11], y[4]);

    ctx.bezierCurveTo(x[12], y[4], x[12], m, x[13], m);

    ctx.lineTo(WIDTH, m + 1);
    ctx.lineTo(x[13], m - 1);

    ctx.bezierCurveTo(x[12], m, x[12], h - y[4], x[11], h - y[4]);
    ctx.bezierCurveTo(x[10], h - y[4], x[10], h - y[3], x[9], h - y[3]);
    ctx.bezierCurveTo(x[8], h - y[3], x[8], h - y[2], x[7], h - y[2]);
    ctx.bezierCurveTo(x[6], h - y[2], x[6], h - y[1], x[5], h - y[1]);
    ctx.bezierCurveTo(x[4], h - y[1], x[4], h - y[0], x[3], h - y[0]);
    ctx.bezierCurveTo(x[2], h - y[0], x[1], m, x[0], m);

    ctx.lineTo(0, m);

    ctx.fill();
    ctx.stroke();
  };

  private visualize = () => {
    if (!this.analyser || !this.freqs) return;

    this.analyser.smoothingTimeConstant = opts.smoothing;
    this.analyser.fftSize = 2 ** opts.fft;
    this.analyser.minDecibels = opts.minDecibels;
    this.analyser.maxDecibels = 0;
    this.analyser.getByteFrequencyData(this.freqs);

    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;

    this.path(0);
    this.path(1);
    this.path(2);

    requestAnimationFrame(this.visualize);
  };
}

createGui();

const canvas = byId<HTMLCanvasElement>('canvas');
const button = byId<HTMLButtonElement>('start');
const visualizer = new AudioVisualizer(canvas);

button.addEventListener('click', async () => {
  button.remove();
  try {
    await visualizer.start();
  } catch (e) {
    document.body.innerHTML = '<h1>Serve HTTPS per usare il microfono.</h1>';
    console.error(e);
  }
});
