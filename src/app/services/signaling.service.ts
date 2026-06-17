import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export type SignalingEvent =
  | { type: 'room-created'; code: string }
  | { type: 'room-joined'; code: string }
  | { type: 'peer-joined' }
  | { type: 'peer-left' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class SignalingService {
  private socket!: Socket;
  readonly events$ = new Subject<SignalingEvent>();

  connect(): void {
    this.socket = io('http://localhost:3000');
    const forward = (type: string) =>
      this.socket.on(type, (payload: any) => this.events$.next({ type, ...payload } as any));
    ['room-created','room-joined','peer-joined','peer-left','offer','answer','ice-candidate','error']
      .forEach(forward);
  }

  createRoom(): void { this.socket.emit('create-room'); }
  joinRoom(code: string): void { this.socket.emit('join-room', { code }); }
  sendOffer(sdp: RTCSessionDescriptionInit): void { this.socket.emit('offer', { sdp }); }
  sendAnswer(sdp: RTCSessionDescriptionInit): void { this.socket.emit('answer', { sdp }); }
  sendIceCandidate(candidate: RTCIceCandidateInit): void { this.socket.emit('ice-candidate', { candidate }); }
  leaveRoom(): void { this.socket.emit('leave-room'); }

  disconnect(): void {
    if (this.socket) { this.socket.disconnect(); }
  }
}
