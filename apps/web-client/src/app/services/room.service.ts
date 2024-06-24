import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Room, RoomMemberSession, Signaling } from '@chattr/interfaces';
import {
  MediaKind
} from 'mediasoup-client/lib/types';
import {
  Observable,
  catchError,
  filter,
  from,
  identity,
  map,
  of,
  switchMap,
  tap,
  toArray
} from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../environments/environment.development';
import { parseHttpClientError } from '../util';
import { Store } from '@ngxs/store';
import { ServerError, UpdateConnectionStatus } from '../actions';

export type RoomEvent<T = any> = {
  event: 'error' | 'message';
  data?: T;
};

export type MediaDevice = {
  type: MediaKind;
  id: string;
  name: string;
  track?: MediaStreamTrack;
};

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  private readonly httpClient = inject(HttpClient);
  private readonly store = inject(Store);
  private socket?: Socket;
  private socketInit = false;

  async createConsumerFor(producerId: string, sessionId: string) {
    this.assertSocket();
    return await this.socket!.emitWithAck(Signaling.CreateConsumer, { producerId, sessionId });
  }

  async leaveSession(roomId: string, sessionId: string) {
    this.assertSocket();
    this.socket!.emit(Signaling.LeaveSession, { roomId, sessionId });
  }

  assertRoomSession(roomId: string) {
    return this.httpClient.get<RoomMemberSession>(`${environment.backendOrigin}/rooms/${roomId}/session`).pipe(
      catchError(parseHttpClientError)
    );
  }

  getConnectableSessions(roomId: string) {
    return this.httpClient.get<RoomMemberSession[]>(`${environment.backendOrigin}/rooms/${roomId}/connectable-sessions`).pipe(
      catchError(parseHttpClientError)
    );
  }

  getRoomInfo(roomId: string) {
    return this.httpClient.get<Room>(`${environment.backendOrigin}/rooms/${roomId}`).pipe(
      catchError(parseHttpClientError)
    );
  }

  findMediaDevices() {
    return from(navigator.mediaDevices.enumerateDevices()).pipe(
      switchMap(identity),
      filter(
        (device) => device.kind == 'audioinput' || device.kind == 'videoinput'
      ),
      map(({ deviceId, label, kind }) => {
        return {
          id: deviceId,
          name: label ?? 'Default Device',
          type: kind == 'audioinput' ? 'audio' : 'video',
        } as MediaDevice;
      }),
      toArray()
    );
  }

  createRoom(name: string) {
    return this.httpClient.post(`${environment.backendOrigin}/rooms`, { name }).pipe(
      catchError(parseHttpClientError)
    );
  }

  private assertSocket() {
    if (!this.socket) throw new Error('No connection has not been established with the server');
  }

  establishConnection(authToken?: string) {
    if (!this.socketInit) {
      this.socket = io(`${environment.backendOrigin}/`, {
        transports: ['websocket'],
        auth: {
          authorization: authToken
        }
      });
      this.socketInit = true;

      this.socket.on('connect', () => {
        this.store.dispatch(new UpdateConnectionStatus('connected'));
      });

      this.socket.on('reconnect', () => {
        this.store.dispatch(new UpdateConnectionStatus('reconnecting'));
      });

      this.socket.on('disconnect', (reason) => {
        this.store.dispatch(new UpdateConnectionStatus('disconnected', reason));
      });

      this.socket.on('errors', ({ errorMessage }: { errorMessage: string }) => {
        this.store.dispatch(new ServerError(errorMessage));
      });
    } else if (!this.socket?.connected) {
      this.socket?.connect();
    }
  }

  closeExistingConnection() {
    if (this.socket?.connected) {
      this.socket.close();
    }
  }

  async joinSession(roomId: string, sessionId: string) {
    this.assertSocket();

    return await this.socket!.emitWithAck(Signaling.JoinSession, { roomId, sessionId });
  }

  getRooms() {
    return this.httpClient.get<Room[]>(`${environment.backendOrigin}/rooms`).pipe(
      catchError(parseHttpClientError)
    );
  }

  async getMediaStream(
    device: string,
    type: 'audio' | 'video',
    width?: number,
    height?: number
  ) {
    let constraints: MediaStreamConstraints;
    if (type == 'audio')
      constraints = {
        audio: {
          deviceId: device,
        },
      };
    else
      constraints = {
        video: {
          deviceId: device,
          width,
          height,
        },
      };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  getPreviewStreamProvider$(
    deviceProvider: () => Observable<[MediaDevice | null, MediaDevice | null]>
  ) {
    let currentStream: MediaStream | null;
    return deviceProvider().pipe(
      switchMap(([audio, video]) => {
        if (currentStream) {
          currentStream.getTracks().forEach((track) => track.stop());
        }

        const constraints: MediaStreamConstraints = {};

        if (audio) {
          constraints.audio = {
            deviceId: audio.id,
            echoCancellation: true,
          };
        }

        if (video) {
          constraints.video = {
            deviceId: video.id,
            width: 320,
            height: 200,
            facingMode: 'front',
          };
        }

        if (!constraints.video && !constraints.audio) return of(null);

        return navigator.mediaDevices.getUserMedia(constraints);
      }),
      tap((stream) => (currentStream = stream))
    );
  }
}
