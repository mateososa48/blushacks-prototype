export class VideoCapture {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Starts webcam capture. Returns the MediaStream (for display in a <video> element). */
  async start(onFrame: (base64Jpeg: string) => void): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });

    this.videoEl = document.createElement('video');
    this.videoEl.srcObject = this.stream;
    this.videoEl.muted = true;
    this.videoEl.setAttribute('playsinline', '');
    await this.videoEl.play();

    // Send 1 frame per second to Gemini
    this.intervalId = setInterval(() => {
      if (!this.videoEl || this.videoEl.readyState < 2) return;
      this.ctx.drawImage(this.videoEl, 0, 0, 640, 480);
      const base64 = this.canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      onFrame(base64);
    }, 1000);

    return this.stream;
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.videoEl = null;
  }
}
