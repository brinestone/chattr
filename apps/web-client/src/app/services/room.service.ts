import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Room } from '@chattr/interfaces';
import { Device } from 'mediasoup-client';
import {
  DtlsParameters,
  MediaKind,
  RtpParameters,
  Transport,
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
  private socket?: Socket;
  private device: Device = new Device();
  private sendTransport?: Transport;

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
    this.httpClient.post<Room>(`${environment.backendOrigin}/rooms`, { name }).pipe(
      catchError(parseHttpClientError)
    );
  }

  private assertSocket(userIdToken: string) {
    if (!this.socket) {
      this.socket = io(`${environment.backendOrigin}`, {
        transports: ['websocket'],
        query: {
          token: userIdToken,
        },
      });
      this.socket.on('errors', (data) => {
        console.error(data);
      });
    }
  }

  joinRoom(id: string, userIdToken: string) {
    this.assertSocket(userIdToken);
    return from(
      this.socket!.emitWithAck('init_session', [{ roomId: id }])
    ).pipe(
      switchMap(async ({ rtpCapabilities, transportParams, sessionId }) => {
        await this.device.load({ routerRtpCapabilities: rtpCapabilities });
        this.sendTransport = this.device.createSendTransport(transportParams);
        this.sendTransport.on(
          'connect',
          ({ dtlsParameters }, callback, errBack) => {
            this.transportConnectCallback(
              id,
              sessionId,
              dtlsParameters,
              callback,
              errBack
            );
          }
        );
        this.sendTransport.on(
          'produce',
          (
            { kind, rtpParameters },
            callback: (arg: { id: string }) => void,
            errBack: (error: Error) => void
          ) => {
            this.transportProduceCallback(
              id,
              sessionId,
              kind,
              rtpParameters,
              callback,
              errBack
            );
          }
        );
      })
    );
  }

  private async transportProduceCallback(
    roomId: string,
    sessionId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    callback: (arg: { id: string }) => void,
    errBack: (arg: Error) => void
  ) {
    try {
      const { producerId } = await this.socket!.emitWithAck(
        'produce',
        { roomId },
        { kind, sessionId, rtpParameters }
      );
      callback({ id: producerId });
    } catch (error) {
      errBack(error as Error);
    }
  }

  private async transportConnectCallback(
    roomId: string,
    sessionId: string,
    dtlsParameters: DtlsParameters,
    callback: () => void,
    errBack: (error: Error) => void
  ) {
    try {
      await this.socket!.emitWithAck(
        'connect_transport',
        { roomId },
        { dtlsParameters, sessionId }
      );
      callback();
    } catch (error) {
      errBack(error as Error);
    }
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
