/**
 * Audio Recording and Playback Helpers
 * Implements browser media recording interface for patient voice intake.
 */

export interface AudioRecordingResult {
  blob: Blob;
  durationMs: number;
  format: string;
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime: number = 0;

  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release immediately if just testing permission
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    this.chunks = [];
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Check supported types
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(250);
  }

  async stop(): Promise<AudioRecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        return reject(new Error('Recorder not active'));
      }

      const timer = setTimeout(() => {
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }
        resolve({
          blob: new Blob(this.chunks, { type: 'audio/webm' }),
          durationMs: Date.now() - this.startTime,
          format: 'audio/webm',
        });
      }, 1500);

      this.mediaRecorder.onstop = () => {
        clearTimeout(timer);
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationMs = Date.now() - this.startTime;

        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }

        resolve({
          blob,
          durationMs,
          format: mimeType,
        });
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.chunks = [];
  }
}

