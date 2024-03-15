import { Room, RoomMember, RoomMemberSession, User } from '@chattr/dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { App } from 'firebase-admin/app';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';
import { createWorker } from 'mediasoup';
import {
  DtlsParameters,
  MediaKind,
  Producer,
  Router,
  RtpCodecCapability,
  RtpParameters,
  WebRtcServer,
  WebRtcTransport,
  Worker,
} from 'mediasoup/node/lib/types';
import { cpus, networkInterfaces, type } from 'os';
import {
  EmptyError,
  catchError,
  forkJoin,
  from,
  generate,
  map,
  mergeMap,
  of,
  switchMap,
  take,
  tap,
  throwError,
  throwIfEmpty,
} from 'rxjs';

let ip = '';

if (type() == 'Darwin')
  ip = networkInterfaces().en0.find((i) => i.family == 'IPv4')!.address;
else if (type() == 'Linux')
  ip = networkInterfaces().eth0.find((i) => i.family == 'IPv4')!.address;

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
    },
  },
] as RtpCodecCapability[];

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private readonly workers = Array<Worker>(Math.min(5, cpus().length));
  private readonly routerWebRtcServerMap: {
    [key: string]: {
      router: Router;
      server: WebRtcServer;
    };
  } = {};
  private readonly webRtcTransports: { [key: string]: WebRtcTransport } = {};
  private readonly producers: { [key: string]: Producer } = {};
  private nextWorkerIndex = -1;
  private readonly db: Firestore;

  constructor(@Inject('FIREBASE') app: App) {
    this.db = getFirestore(app);
  }

  private get nextWorker() {
    return this.workers[++this.nextWorkerIndex % this.workers.length];
  }

  getRooms() {
    this.db.collection('/');
  }

  async createRoom(name: string, ownerRef: string) {
    const roomRef = this.db.collection('/rooms').doc();
    await roomRef.set({
      name,
      memberUids: [ownerRef],
      dateCreated: Date.now(),
    } as Room);

    const memberRef = this.db
      .collection(`rooms/${roomRef.id}/members`)
      .doc(ownerRef);
    await memberRef.set({
      uid: ownerRef,
      isBanned: false,
      role: 'owner',
    } as RoomMember);
    return await roomRef.get();
  }

  onApplicationBootstrap() {
    this.logger.verbose('Starting workers...');
    generate(
      0,
      (x) => x < this.workers.length,
      (n) => n + 1
    )
      .pipe(
        mergeMap((index) =>
          forkJoin([
            createWorker({
              logLevel: 'debug',
              rtcMaxPort: 50000,
              rtcMinPort: 40000,
            }),
            of(index),
          ])
        )
      )
      .subscribe({
        next: ([worker, index]) => {
          this.logger.verbose(`worker::${worker.pid}::create`);
          this.workers[index] = worker;

          worker.observer.on('newwebrtcserver', (server) => {
            this.logger.verbose(
              `New WebRTC server::${server.id} on worker::${worker.pid}`
            );
            server.observer.on('close', () => {
              this.logger.verbose(
                `WebRTC server::${server.id} closed on worker::${worker.pid}`
              );
            });
          });

          worker.observer.on('newrouter', (router) => {
            this.logger.verbose(
              `New router::${router.id} on worker::${worker.pid}`
            );

            router.observer.on('newtransport', (transport) => {
              this.logger.verbose(
                `New transport::${transport.id} on router::${router.id}`
              );

              transport.observer.on('close', () => {
                this.logger.verbose(
                  `Transport::${transport.id} closed on router::${router.id}`
                );
              });

              transport.observer.on('newproducer', (producer) => {
                this.logger.verbose(
                  `New Producer::${producer.id} on transport::${transport.id}`
                );
              });

              transport.observer.on('newconsumer', (consumer) => {
                this.logger.verbose(
                  `New Consumer::${consumer.id} on transport::${transport.id}`
                );
              });
            });

            router.observer.on('close', () => {
              this.logger.verbose(
                `Router::${router.id} closed on worker:${worker.pid}`
              );
            });
          });
        },
        complete: () =>
          this.logger.verbose(
            `${this.workers.length} workers started successfully`
          ),
        error: (error: Error) => {
          this.logger.error(error.message, error.stack);
        },
      });
  }

  beforeApplicationShutdown() {
    this.logger.verbose('Shutting down workers...');
    this.workers.forEach((worker) => worker.close());
  }

  createProducer(
    {
      sessionId,
      rtpParameters,
      kind,
    }: { rtpParameters: RtpParameters; kind: MediaKind; sessionId: string },
    room: Room
  ) {
    const transport = this.webRtcTransports[sessionId];
    if (!transport) {
      return throwError(() => new Error('Transport already closed'));
    }

    return from(transport.produce({ kind, rtpParameters })).pipe(
      tap((producer) => {
        this.producers[producer.id] = producer;
        this.db
          .doc(`rooms/${room.ref}/sessions/${sessionId}`)
          .update({
            producers: FieldValue.arrayUnion(producer.id),
          })
          .then(() => this.logger.verbose(`Session: ${sessionId} updated`));
      }),
      map(({ id }) => ({ producerId: id }))
    );
  }

  connectTransport({
    dtlsParameters,
    sessionId,
  }: {
    dtlsParameters: DtlsParameters;
    sessionId: string;
  }) {
    const transport = this.webRtcTransports[sessionId];
    if (!transport)
      return throwError(() => new Error('Transport already closed'));
    return from(transport.connect({ dtlsParameters }));
  }

  assertSession(room: Room, user: User, clientIp: string) {
    return from(
      this.db
        .collection(`rooms/${room.ref}/sessions`)
        .where('serverIp', '==', ip)
        .where('sessionOwner', '==', user.uid)
        .where('endDate', '==', null)
        .orderBy('startDate', 'desc')
        .limit(1)
        .get()
    ).pipe(
      mergeMap((snapshot) => {
        return snapshot.docs;
      }),
      throwIfEmpty(),
      map((snapshot) => snapshot.data() as RoomMemberSession),
      tap((session) => this.logger.verbose(`Reusing session: ${session.id}.`)),
      catchError((error: Error) => {
        if (error instanceof EmptyError) {
          return of(
            this.db.collection(`rooms/${room.ref}/sessions`).doc()
          ).pipe(
            tap((ref) =>
              this.logger.verbose(
                `Sessions timed out. Creating new Session: ${ref.id}`
              )
            ),
            switchMap((ref) =>
              from(
                ref.set({
                  clientIp,
                  serverIp: ip,
                  id: ref.id,
                  producers: [],
                  sessionOwner: user.uid,
                  startDate: Date.now(),
                } as RoomMemberSession)
              ).pipe(
                switchMap(() => ref.get()),
                map((doc) => doc.data() as RoomMemberSession)
              )
            )
          );
        }
        return throwError(() => error);
      }),
      switchMap((session) => {
        return forkJoin([
          this.assertWebRtcTransport(room.ref, session.id),
          of(session),
        ]);
      }),
      map(
        ([
          { id, iceCandidates, iceParameters, dtlsParameters, sctpParameters },
          session,
        ]) => {
          const { router } = this.routerWebRtcServerMap[room.ref];
          return {
            transportParams: {
              id,
              iceParameters,
              iceCandidates,
              dtlsParameters,
              sctpParameters,
            },
            rtpCapabilities: router.rtpCapabilities,
            sessionId: session.id,
          };
        }
      )
    );
  }

  private async assertWebRtcTransport(routerMapId: string, id: string) {
    let transport = this.webRtcTransports[id];

    if (!transport) {
      let entry = this.routerWebRtcServerMap[routerMapId];
      if (!entry) {
        await this.assertRouter(routerMapId);
        entry = this.routerWebRtcServerMap[routerMapId];
      }
      const { router, server } = entry;
      transport = await router.createWebRtcTransport({
        webRtcServer: server,
        enableUdp: true,
      });
      this.webRtcTransports[id] = transport;
    }

    return transport;
  }

  private async assertRouter(id: string) {
    let entry = this.routerWebRtcServerMap[id];
    if (!entry) {
      const worker = this.nextWorker;
      const router = await worker.createRouter({
        mediaCodecs,
      });
      const server = await worker.createWebRtcServer({
        listenInfos: [
          {
            ip,
            protocol: 'udp',
          },
        ],
      });
      entry = this.routerWebRtcServerMap[id] = { router, server };
    }
    return entry.router;
  }
}
