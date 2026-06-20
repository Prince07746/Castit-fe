import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SignalingService } from '../../services/signaling.service';
import { Subscription } from 'rxjs';

type CastState = 'idle' | 'joining' | 'selecting' | 'casting' | 'error';
type CaptureMode = 'screen' | 'camera';

@Component({
  selector: 'app-cast',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cast.html',
  styleUrl: './cast.scss'
})
export class CastComponent implements OnInit, OnDestroy {
  @ViewChild('previewEl') previewElRef!: ElementRef<HTMLVideoElement>;

  state: CastState = 'idle';
  captureMode: CaptureMode = 'screen';
  roomCode = '';
  error = '';
  private pc!: RTCPeerConnection;
  private stream!: MediaStream;
  private sub!: Subscription;

  constructor(private signaling: SignalingService) {}

  ngOnInit(): void {
    if (!this.supportsScreenCapture && this.supportsCameraCapture) {
      this.captureMode = 'camera';
    }

    this.signaling.connect();
    this.sub = this.signaling.events$.subscribe(async ev => {
      switch (ev.type) {
        case 'room-joined':
          this.state = 'selecting';
          break;
        case 'peer-joined':
          // TV is ready - we don't handle offer here, TV sends it
          break;
        case 'offer':
          await this.handleOffer(ev.sdp);
          break;
        case 'ice-candidate':
          try { await this.pc?.addIceCandidate(new RTCIceCandidate(ev.candidate)); } catch {}
          break;
        case 'peer-left':
          this.stopCasting();
          this.state = 'idle';
          this.error = 'TV disconnected';
          break;
        case 'error':
          this.error = ev.message;
          this.state = 'error';
          break;
      }
    });
  }

  joinRoom(): void {
    if (this.roomCode.length !== 6) return;
    this.error = '';
    this.state = 'joining';
    this.signaling.joinRoom(this.roomCode);
  }

  setMode(mode: CaptureMode): void {
    if (mode === 'screen' && !this.supportsScreenCapture) {
      this.error = 'Screen sharing is not available in this browser. Use camera casting or open Castit in a supported desktop browser.';
      return;
    }
    this.captureMode = mode;
    this.error = '';
  }

  async startCasting(): Promise<void> {
    this.error = '';
    try {
      if (this.captureMode === 'screen') {
        if (!this.supportsScreenCapture) {
          this.error = 'Screen sharing is not available in this browser. Use camera casting or open Castit in a supported desktop browser.';
          return;
        }
        this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      } else {
        if (!this.supportsCameraCapture) {
          this.error = 'Camera access is not available in this browser.';
          return;
        }
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
      }

      setTimeout(() => {
        const preview = this.previewElRef?.nativeElement;
        if (preview) {
          preview.srcObject = this.stream;
          preview.play().catch(() => {});
        }
      }, 50);

      this.stream.getVideoTracks()[0].onended = () => this.stopCasting();

      if (this.pc) {
        this.stream.getTracks().forEach(t => this.pc.addTrack(t, this.stream));
      }

      this.state = 'casting';
    } catch (err: any) {
      this.error = err.message ?? 'Failed to capture';
      this.state = 'selecting';
    }
  }

  get supportsScreenCapture(): boolean {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getDisplayMedia === 'function';
  }

  get supportsCameraCapture(): boolean {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function';
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signaling.sendIceCandidate(candidate.toJSON());
    };

    if (this.stream) {
      this.stream.getTracks().forEach(t => this.pc.addTrack(t, this.stream));
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.signaling.sendAnswer(answer);
  }

  switchMode(mode: CaptureMode): void {
    if (this.state === 'casting') {
      this.stopCasting();
      this.captureMode = mode;
      this.state = 'selecting';
    } else {
      this.captureMode = mode;
    }
  }

  stopCasting(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.state = 'selecting';
  }

  disconnect(): void {
    this.stopCasting();
    this.signaling.leaveRoom();
    this.state = 'idle';
    this.roomCode = '';
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.stream?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.signaling.disconnect();
  }
}
