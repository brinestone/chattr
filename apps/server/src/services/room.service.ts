import { Room, User } from '@chattr/interfaces';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
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
import { HydratedDocument, Model } from 'mongoose';
import { cpus, networkInterfaces, type } from 'os';
import {
  EmptyError,
  catchError,
  concatMap,
  first,
  forkJoin,
  from,
  map,
  of,
  switchMap,
  tap,
  throwError,
  throwIfEmpty,
} from 'rxjs';
import { RoomEntity, RoomMemberEntity, RoomSessionEntity } from '../models';

type RouterWebRtcServerMap = Record<
  string,
  { router: Router; server: WebRtcServer }
>;

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
  private readonly routerWebRtcServerMap: RouterWebRtcServerMap = {};
  private readonly webRtcTransports: Record<string, WebRtcTransport> = {};
  private readonly producers: Record<string, Producer> = {};
  private nextWorkerIndex = -1;
  constructor(
    @InjectModel(RoomEntity.name) private model: Model<RoomEntity>,
    @InjectModel(RoomMemberEntity.name)
    private memberModel: Model<RoomMemberEntity>,
    @InjectModel(RoomSessionEntity.name)
    private sessionModel: Model<RoomSessionEntity>
  ) {}

  private get nextWorker() {
    return this.workers[++this.nextWorkerIndex % this.workers.length];
  }

  async createRoom(name: string, owner: HydratedDocument<User>) {
    const session = await this.model.startSession();

    return await session
      .withTransaction(() => {
        const memberModel = new this.memberModel({
          userId: owner,
          isBanned: false,
          role: 'owner',
        });
        const roomModel = new this.model({
          name,
          members: [memberModel],
        });
        return Promise.all([memberModel.save(), roomModel.save()]);
      })
      .then(([member]) => member);
  }

  onApplicationBootstrap() {
    this.logger.verbose('Starting workers...');
    from(this.workers)
      .pipe(
        concatMap((_, index) =>
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

  createProducer({
    sessionId,
    rtpParameters,
    kind,
  }: {
    rtpParameters: RtpParameters;
    kind: MediaKind;
    sessionId: string;
  }) {
    const transport = this.webRtcTransports[sessionId];
    if (!transport) {
      return throwError(() => new Error('Transport already closed'));
    }

    return from(transport.produce({ kind, rtpParameters })).pipe(
      tap(async (producer) => {
        this.producers[producer.id] = producer;
        await this.sessionModel.updateOne(
          { _id: sessionId },
          {
            $inc: { _v: 1 },
            $push: {
              producers: producer.id,
            },
          }
        );
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
    const member$ = from(
      this.memberModel
        .findOne({
          userId: user.id,
        })
        .exec()
    );
    return member$.pipe(
      first((doc) => !!doc),
      switchMap((doc) =>
        this.sessionModel
          .findOne({
            serverIp: ip,
            owner: doc._id,
            endDate: null,
          })
          .exec()
      ),
      throwIfEmpty(),
      tap((session) => this.logger.verbose(`Reusing session: ${session.id}.`)),
      catchError((error: Error) => {
        if (error instanceof EmptyError) {
          return forkJoin([member$, this.sessionModel.startSession()]).pipe(
            tap(() =>
              this.logger.verbose(`Sessions timed out. Creating new Session`)
            ),
            concatMap(([member, clientSession]) => {
              return clientSession.withTransaction(() => {
                const session = new this.sessionModel({
                  clientIp,
                  serverIp: ip,
                  member,
                });
                return session.save();
              });
            })
          );
        }
        return throwError(() => error);
      }),
      map((doc) => plainToInstance(RoomSessionEntity, doc)),
      switchMap((session) => {
        return forkJoin([
          this.assertWebRtcTransport(room.id, session.id),
          of(session),
        ]);
      }),
      map(
        ([
          { id, iceCandidates, iceParameters, dtlsParameters, sctpParameters },
          session,
        ]) => {
          const { router } = this.routerWebRtcServerMap[room.id];
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
