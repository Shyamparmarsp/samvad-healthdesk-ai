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
  private isStopping: boolean = false;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onTrackEndedCallback: (() => void) | null = null;

  async requestPermission(): Promise<boolean> {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) return false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release immediately if just testing permission
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }

  setOnError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  setOnTrackEnded(callback: () => void): void {
    this.onTrackEndedCallback = callback;
  }

  get isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  get durationMs(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  async start(): Promise<void> {
    if (this.isRecording) {
      return;
    }
    this.chunks = [];
    this.isStopping = false;

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser environment');
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Monitor track ended events (e.g. microphone disconnected)
    this.mediaStream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (this.onTrackEndedCallback) {
          this.onTrackEndedCallback();
        }
      };
    });

    // Check supported types
    let mimeType = 'audio/webm';
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
    }

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onerror = (e: any) => {
      const err = e.error || new Error('MediaRecorder encountered an error');
      if (this.onErrorCallback) {
        this.onErrorCallback(err);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(250);
  }

  async stop(): Promise<AudioRecordingResult> {
    if (this.isStopping) {
      throw new Error('Stop already in progress');
    }
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      throw new Error('Recorder not active');
    }

    this.isStopping = true;

    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder!;
      const mimeType = recorder.mimeType || 'audio/webm';

      const cleanupTracks = () => {
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {}
          });
          this.mediaStream = null;
        }
      };

      const fallbackTimer = setTimeout(() => {
        cleanupTracks();
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationMs = Date.now() - this.startTime;
        this.mediaRecorder = null;
        this.isStopping = false;
        resolve({
          blob,
          durationMs,
          format: mimeType,
        });
      }, 1000);

      recorder.onstop = () => {
        clearTimeout(fallbackTimer);
        cleanupTracks();
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationMs = Date.now() - this.startTime;
        this.mediaRecorder = null;
        this.isStopping = false;

        resolve({
          blob,
          durationMs,
          format: mimeType,
        });
      };

      try {
        recorder.stop();
      } catch (err) {
        clearTimeout(fallbackTimer);
        cleanupTracks();
        this.mediaRecorder = null;
        this.isStopping = false;
        reject(err);
      }
    });
  }

  cancel(): void {
    this.isStopping = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onerror = null;
        this.mediaRecorder.stop();
      } catch {}
    }
    this.mediaRecorder = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.mediaStream = null;
    }
    this.chunks = [];
  }
}

