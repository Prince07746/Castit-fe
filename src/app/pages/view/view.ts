import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SignalingService } from '../../services/signaling.service';
import { Subscription } from 'rxjs';

type ConnectionState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected';

@Component({
  selector: 'app-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './view.html',
  styleUrl: './view.scss'
})
export class ViewComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoElRef!: ElementRef<HTMLVideoElement>;

  state: ConnectionState = 'idle';
  roomCode = '';
  error = '';
  private pc!: RTCPeerConnection;
  private sub!: Subscription;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  constructor(private signaling: SignalingService) {}

  ngOnInit(): void {
    this.signaling.connect();
    this.sub = this.signaling.events$.subscribe(async ev => {
      switch (ev.type) {
        case 'room-created':
          this.roomCode = ev.code;
          this.state = 'waiting';
          break;
        case 'peer-joined':
          this.state = 'connecting';
          await this.initPeerConnection();
          const offer = await this.pc.createOffer();
          await this.pc.setLocalDescription(offer);
          this.signaling.sendOffer(offer);
          break;
        case 'answer':
          await this.pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
          await this.flushPendingIceCandidates();
          break;
        case 'ice-candidate':
          await this.addOrQueueIceCandidate(ev.candidate);
          break;
        case 'peer-left':
          this.state = 'disconnected';
          this.pc?.close();
          break;
        case 'error':
          this.error = ev.message;
          break;
      }
    });
  }

  createRoom(): void {
    this.error = '';
    this.signaling.createRoom();
  }

  private async initPeerConnection(): Promise<void> {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.pendingIceCandidates = [];
    this.pc.addTransceiver('video', { direction: 'recvonly' });
    this.pc.addTransceiver('audio', { direction: 'recvonly' });

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signaling.sendIceCandidate(candidate.toJSON());
    };
    this.pc.ontrack = (ev) => {
      this.state = 'connected';
      setTimeout(() => {
        const video = this.videoElRef?.nativeElement;
        if (video && ev.streams[0]) {
          video.srcObject = ev.streams[0];
          video.play().catch(() => {});
        }
      }, 50);
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed'
        || this.pc.connectionState === 'closed'
        || this.pc.connectionState === 'disconnected') {
        this.state = 'disconnected';
      }
    };
  }

  private async addOrQueueIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      this.error = 'The devices could not establish a media connection.';
    }
  }

  private async flushPendingIceCandidates(): Promise<void> {
    const candidates = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];
    for (const candidate of candidates) {
      await this.addOrQueueIceCandidate(candidate);
    }
  }

  reconnect(): void {
    this.state = 'idle';
    this.roomCode = '';
    this.pc?.close();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.pc?.close();
    this.signaling.disconnect();
  }
}
