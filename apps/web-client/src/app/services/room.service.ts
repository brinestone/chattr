import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ICreateRoomInviteRequest, IRoom, IRoomSession, IUpdateInviteRequest, InviteInfo, Signaling } from '@chattr/interfaces';
import { Store } from '@ngxs/store';
import {
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters
} from 'mediasoup-client/lib/types';
import {
  catchError
} from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../environments/environment.development';
import { RemoteProducerClosed, RemoteProducerOpened, RemoteSessionClosed, RemoteSessionOpened, RoomError, StatsEnded, StatsUpdated, UpdateConnectionStatus } from '../actions';
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
  private readonly store = inject(Store);
  private socket?: Socket;
  private socketInit = false;

  async toggleConsumer(consumerId: string) {
    this.assertSocket();
    return await this.socket!.emitWithAck(Signaling.ToggleConsumer, { consumerId });
  }

  updateInvite(code: string, accept: boolean) {
    const body: IUpdateInviteRequest = { code, accept };
    return this.httpClient.put(`${environment.backendOrigin}/invites`, body).pipe(
      catchError(parseHttpClientError)
    );
  }

  getInvitationInfo(code: string) {
    return this.httpClient.get<InviteInfo>(`${environment.backendOrigin}/invites/${code}`).pipe(
      catchError(parseHttpClientError)
    );
  }

  createInviteLink(redirect: string, roomId: string, key: string) {
    const request: ICreateRoomInviteRequest = {
      redirect,
      roomId,
      key
    };
    return this.httpClient.post<{ url: string }>(`${environment.backendOrigin}/rooms/invite`, request).pipe(
      catchError(parseHttpClientError)
    )
  }

  closeConsumer(consumerId: string) {
    this.assertSocket();
    this.socket!.emit(Signaling.CloseConsumer, { consumerId });
  }

  openConsumerStatsStream(consumerId: string, type: 'consumer' | 'producer') {
    this.socket!.emit(Signaling.StatsSubscribe, { type, id: consumerId });
  }

  async closeProducer(sessionId: string, producerId: string) {
    this.assertSocket();
    return await this.socket!.emitWithAck(Signaling.CloseProducer, { sessionId, producerId });
  }

  async createProducer(sessionId: string, rtpParameters: RtpParameters, kind: MediaKind) {
    this.assertSocket();
    return await this.socket!.emitWithAck(Signaling.CreateProducer, { sessionId, rtpParameters, kind });
  }

  async connectTransport(sessionId: string, dtlsParameters: DtlsParameters) {
    this.assertSocket();
    return await this.socket!.emitWithAck(Signaling.ConnectTransport, { sessionId, dtlsParameters });
  }

  async createConsumerFor(producerId: string, sessionId: string, rtpCapabilities: RtpCapabilities) {
    this.assertSocket();
    return await this.socket!.emitWithAck(Signaling.CreateConsumer, { producerId, sessionId, rtpCapabilities });
  }

  async leaveSession(sessionId: string) {
    this.assertSocket();
    this.socket!.emit(Signaling.LeaveSession, { sessionId });
  }

  findRoomSession(sessionId: string) {
    return this.httpClient.get<IRoomSession>(`${environment.backendOrigin}/rooms/sessions/${sessionId}`).pipe(
      catchError(parseHttpClientError)
    );
  }

  assertRoomSession(roomId: string) {
    return this.httpClient.get<IRoomSession>(`${environment.backendOrigin}/rooms/${roomId}/session`).pipe(
      catchError(parseHttpClientError)
    );
  }

  getConnectableSessions(roomId: string) {
    return this.httpClient.get<IRoomSession[]>(`${environment.backendOrigin}/rooms/${roomId}/connectable-sessions`).pipe(
      catchError(parseHttpClientError)
    );
  }

  getRoomInfo(roomId: string) {
    return this.httpClient.get<IRoom>(`${environment.backendOrigin}/rooms/${roomId}`).pipe(
      catchError(parseHttpClientError)
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

  establishConnection(roomId: string, authToken?: string) {
    if (!this.socketInit) {
      this.socket = io(`${environment.backendOrigin}/`, {
        transports: ['websocket'],
        auth: {
          authorization: authToken
        }
      });
      this.socketInit = true;

      this.socket.on('connect', () => {
        console.log('Recovered?', this.socket?.recovered);
        this.store.dispatch(new UpdateConnectionStatus('connected'));
        this.subscribeToMessages();
      });

      this.socket.on('reconnect', () => {
        this.store.dispatch(new UpdateConnectionStatus('reconnecting'));
      });

      this.socket.on('disconnect', (reason) => {
        this.store.dispatch(new UpdateConnectionStatus('disconnected', reason));
      });

      this.socket.on('errors', ({ errorMessage }: { errorMessage: string }) => {
        this.store.dispatch(new RoomError(errorMessage, roomId));
      });
    } else if (!this.socket?.connected) {
      this.socket?.connect();
    }
  }

  private subscribeToMessages() {
    const socket = this.socket as Socket;

    socket.on(Signaling.SessionClosed, ({ sessionId }: { sessionId: string }) => {
      this.store.dispatch(new RemoteSessionClosed(sessionId));
    });

    socket.on(Signaling.SessionOpened, ({ sessionId }: { sessionId: string }) => {
      this.store.dispatch(new RemoteSessionOpened(sessionId));
    });

    socket.on(Signaling.ProducerOpened, ({ producerId, sessionId }: { producerId: string, sessionId: string }) => {
      this.store.dispatch(new RemoteProducerOpened(sessionId, producerId));
    });

    socket.on(Signaling.ProducerClosed, ({ producerId, sessionId }: { producerId: string, sessionId: string }) => {
      this.store.dispatch(new RemoteProducerClosed(sessionId, producerId));
    });

    socket.on(Signaling.StatsEnd, ({ id }: { id: string }) => {
      this.store.dispatch(new StatsEnded(id));
    });

    socket.on(Signaling.StatsUpdate, ({ id, update, type }: { id: string, update: any, type: 'producer' | 'consumer' }) => {
      this.store.dispatch(new StatsUpdated(id, update, type));
    });
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
    return this.httpClient.get<IRoom[]>(`${environment.backendOrigin}/rooms`).pipe(
      catchError(parseHttpClientError)
    );
  }
}
