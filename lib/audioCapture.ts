export class AudioCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  /** Starts microphone capture. Returns the MediaStream (for mic level meter). */
  async start(onChunk: (base64Pcm: string) => void): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true } as MediaTrackConstraints,
      video: false,
    });

    // AudioContext at 16kHz for Gemini PCM input
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // ScriptProcessorNode: 4096 samples = ~256ms at 16kHz
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const floats = e.inputBuffer.getChannelData(0);
      // Convert float32 [-1, 1] → int16 PCM
      const pcm16 = new Int16Array(floats.length);
      for (let i = 0; i < floats.length; i++) {
        const s = Math.max(-1, Math.min(1, floats[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
      onChunk(base64);
    };

    this.source.connect(this.processor);
    // Must connect to destination to keep the audio graph alive
    this.processor.connect(this.audioContext.destination);

    return this.stream;
  }

  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.audioContext?.close();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.audioContext = null;
    this.processor = null;
    this.source = null;
  }
}
