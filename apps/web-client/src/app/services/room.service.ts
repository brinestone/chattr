import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { Room } from '@chattr/interfaces';
import { getIdToken } from 'firebase/auth';
import { Device } from 'mediasoup-client';
import {
  DtlsParameters,
  MediaKind,
  RtpParameters,
  Transport,
} from 'mediasoup-client/lib/types';
import {
  Observable,
  filter,
  from,
  identity,
  map,
  of,
  switchMap,
  tap,
  throwError,
  toArray,
} from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../environments/environment.development';

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
  private readonly db = inject(Firestore);
  private readonly auth = inject(Auth);
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
    const user = this.auth.currentUser;
    if (!user) {
      return throwError(() => new Error('You have not signed in'));
    }
    const room = { name };

    return from(getIdToken(user)).pipe(
      switchMap((idToken) =>
        this.httpClient.post<Room>(`${environment.backendOrigin}/rooms`, room, {
          headers: {
            authorization: idToken,
          },
        })
      )
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

  getRooms$() {
    return authState(this.auth).pipe(map(() => new Set<Room>()));
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
