import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ICreateRoomInviteRequest, IPresentation, IRoom, IRoomSession, IUpdateInviteRequest, InviteInfo, Signaling } from '@chattr/interfaces';
import { Store } from '@ngxs/store';
import {
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters
} from 'mediasoup-client/lib/types';
import {
  catchError,
  debounceTime,
  fromEvent,
  map,
  of,
  takeUntil,
  throwError
} from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../environments/environment.development';
import { PresentationStarted, PresentationUpdated, RemoteProducerClosed, RemoteProducerOpened, RemoteSessionClosed, RemoteSessionOpened, RoomError, SpeakingSessionChanged, StatsEnded, StatsUpdated, UpdateConnectionStatus } from '../actions';
import { parseHttpClientError } from '../util';

export type RoomEvent<T = unknown> = {
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

  async createPresentationConsmer(id: string, producerId: string, rtpCapabilities: RtpCapabilities) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.CreatePresentationConsumer, { presentationId: id, producerId, rtpCapabilities })
  }

  async createPresentationProducer(id: string, rtpParameters: RtpParameters) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.CreatePresentationProducer, { presentationId: id, rtpParameters });
  }

  async connectPresentationTransport(id: string, dtlsParameters: DtlsParameters) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.ConnectPresentationTransport, { presentationId: id, dtlsParameters });
  }

  async joinPresentation(id: string, roomId: string) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.JoinPresentation, { id, roomId });
  }

  getCurrentPresentation(roomId: string) {
    return this.httpClient.get<IPresentation | undefined>(`${environment.backendOrigin}/rooms/${roomId}/presentations/current`).pipe(
      catchError((err: Error) => {
        if (err instanceof HttpErrorResponse && err.status == 404) {
          return of(undefined);
        }
        return throwError(() => err);
      }),
      catchError(parseHttpClientError)
    )
  }

  findPresentation(id: string) {
    return this.httpClient.get<IPresentation>(`${environment.backendOrigin}/rooms/presentations/${id}`).pipe(
      catchError(parseHttpClientError)
    )
  }

  createPresentation(roomId: string) {
    return this.httpClient.put<IPresentation>(`${environment.backendOrigin}/rooms/${roomId}/present`, {}).pipe(
      catchError(parseHttpClientError)
    );
  }

  async toggleConsumer(consumerId: string) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.ToggleConsumer, { consumerId });
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
    if (!this.socket) return;
    this.socket.emit(Signaling.CloseConsumer, { consumerId });
  }

  openConsumerStatsStream(consumerId: string, type: 'consumer' | 'producer') {
    if (!this.socket) return;
    this.socket.emit(Signaling.StatsSubscribe, { type, id: consumerId });
  }

  async closeProducer(sessionId: string, producerId: string) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.CloseProducer, { sessionId, producerId });
  }

  async createProducer(sessionId: string, rtpParameters: RtpParameters, kind: MediaKind) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.CreateSessionProducer, { sessionId, rtpParameters, kind });
  }

  async connectTransport(sessionId: string, dtlsParameters: DtlsParameters) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.ConnectSessionTransport, { sessionId, dtlsParameters });
  }

  async createConsumerFor(producerId: string, sessionId: string, rtpCapabilities: RtpCapabilities) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.CreateSessionConsumer, { producerId, sessionId, rtpCapabilities });
  }

  async leaveSession(sessionId: string) {
    if (!this.socket) return;
    this.socket.emit(Signaling.LeaveSession, { sessionId });
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
        autoConnect: false,
        transports: ['websocket'],
        auth: {
          authorization: authToken
        }
      });
      this.socketInit = true;

      this.socket.on('error', (x, y, z) => console.log(x, y, z))

      this.socket.on('connect', () => {
        this.store.dispatch(new UpdateConnectionStatus('connected'));
        this.subscribeToMessages();
      });

      // this.socket.on('reconnect', () => {
      //   this.store.dispatch(new UpdateConnectionStatus('reconnecting'));
      // });

      this.socket.on('disconnect', (reason) => {
        this.store.dispatch(new UpdateConnectionStatus('disconnected', reason));
      });

      this.socket.on('errors', ({ errorMessage }: { errorMessage: string }) => {
        this.store.dispatch(new RoomError(errorMessage, roomId));
      });
      this.socket.connect();
    } else if (!this.socket?.connected) {
      this.socket?.connect();
    }
  }

  private subscribeToMessages() {
    const socket = this.socket as Socket;

    const close$ = fromEvent(socket, 'close');
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

    socket.on(Signaling.StatsUpdate, ({ id, update, type }: { id: string, update: RTCStatsReport, type: 'producer' | 'consumer' }) => {
      this.store.dispatch(new StatsUpdated(id, update, type));
    });

    socket.on(Signaling.SpeakingSessionChanged, ({ sessionId }: { sessionId: string }) => {
      this.store.dispatch(new SpeakingSessionChanged(sessionId));
    });

    // socket.on(Signaling.PresentationCreated, ({ presentationId, timestamp }: { timestamp: string, presentationId: string }) => {
    //   this.store.dispatch(new PresentationUpdated(presentationId, new Date(timestamp)));
    // });

    // socket.on(Signaling.PresentationUpdated, ({ presentationId: id, timestamp }: { timestamp: string, presentationId: string }) => {
    //   this.store.dispatch(new PresentationUpdated(id, new Date(timestamp)));
    // });
    fromEvent(socket, Signaling.PresentationUpdated).pipe(
      takeUntil(close$),
      debounceTime(100),
      map(({ presentationId: id, timestamp }: { timestamp: string, presentationId: string }) => new PresentationUpdated(id, new Date(timestamp)))
    ).subscribe(action => this.store.dispatch(action));

    fromEvent(socket, Signaling.PresentationStarted).pipe(
      takeUntil(close$),
    ).subscribe(({ presentationId, producerId }: { producerId: string, presentationId: string }) => {
      this.store.dispatch(new PresentationStarted(presentationId, producerId));
    });
  }

  closeExistingConnection() {
    if (this.socket?.connected) {
      this.socket.close();
    }
  }

  async joinSession(roomId: string, sessionId: string) {
    if (!this.socket) return;
    return await this.socket.emitWithAck(Signaling.JoinSession, { roomId, sessionId });
  }

  getRooms() {
    return this.httpClient.get<IRoom[]>(`${environment.backendOrigin}/rooms`).pipe(
      catchError(parseHttpClientError)
    );
  }
}
