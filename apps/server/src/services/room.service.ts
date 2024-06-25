import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { createWorker } from 'mediasoup';
import {
  Consumer,
  DtlsParameters,
  MediaKind,
  Producer,
  Router,
  RtpCapabilities,
  RtpCodecCapability,
  RtpParameters,
  WebRtcServer,
  WebRtcTransport,
  Worker,
} from 'mediasoup/node/lib/types';
import { Model, Types } from 'mongoose';
import { cpus, networkInterfaces } from 'os';
import {
  concatMap,
  filter,
  forkJoin,
  from,
  identity,
  mergeMap,
  of,
  take
} from 'rxjs';
import { RoomEntity, RoomMemberEntity, RoomSessionEntity, UserEntity } from '../models';

type RouterWebRtcServerMap = Record<
  string,
  { router: Router; server: WebRtcServer }
>;

let ip = '';

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

function generateUniqueCode(...tokens: string[]) {
  const cipher = createHash('md5');
  cipher.update(tokens.join('\n'));
  return cipher.digest('hex').toLowerCase();
}

function computeTransportId(userId: string, sessionId: string) {
  return generateUniqueCode(userId, sessionId);
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private readonly workers = Array<Worker>(Math.min(5, cpus().length));
  private readonly routerWebRtcServerMap: RouterWebRtcServerMap = {};
  private readonly webRtcTransports: Record<string, WebRtcTransport> = {};
  private readonly producers: Record<string, Producer> = {};
  private readonly consumers: Record<string, Consumer> = {};
  private nextWorkerIndex = -1;
  constructor(
    @InjectModel(RoomEntity.name) private model: Model<RoomEntity>,
    @InjectModel(RoomMemberEntity.name)
    private memberModel: Model<RoomMemberEntity>,
    @InjectModel(RoomSessionEntity.name)
    private sessionModel: Model<RoomSessionEntity>
  ) { }

  private get nextWorker() {
    return this.workers[++this.nextWorkerIndex % this.workers.length];
  }

  async findSessionById(sessionId: string) {
    const sessionDoc = await this.sessionModel.findById(sessionId);
    if (!sessionDoc) throw new NotFoundException('Session not found');

    return new RoomSessionEntity(sessionDoc.toObject());
  }

  closeConsumer(consumerId: string) {
    const consumer = this.consumers[consumerId];
    if (!consumer) throw new NotFoundException('Consumer: ' + consumerId + ' not found');
    consumer.close();
    delete this.consumers[consumerId];
  }

  async closeSession(id: string) {
    this.logger.verbose(`Closing session: ${id}`);
    const sessionDoc = await this.sessionModel.findById(id);
    const transportId = computeTransportId(sessionDoc.userId, id);
    const routerServerEntry = this.routerWebRtcServerMap[id];
    if (routerServerEntry) {
      routerServerEntry.router.close();
      routerServerEntry.server.close();
      delete this.routerWebRtcServerMap[id];
      delete this.webRtcTransports[transportId];
    }
    await sessionDoc.updateOne({
      $set: {
        producers: [],
        connected: false,
        endDate: new Date()
      }
    }).exec();

  }

  async createConsumer(sessionId: string, userId: string, producerId: string, rtpCapabilities: RtpCapabilities) {
    const transportId = computeTransportId(userId, sessionId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) throw new NotFoundException('Transport not found');

    const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
    this.consumers[consumer.id] = consumer;

    return { rtpParameters: consumer.rtpParameters, kind: consumer.kind, id: consumer.id };
  }

  async findConnectableSessionsFor(roomId: string, userId: string) {
    const membership = await this.memberModel.findOne({
      userId, roomId
    }).exec();
    const roomDoc = await this.model.findById(roomId).exec();

    if (!membership || !roomDoc) throw new NotFoundException('Room not found');
    if (membership.isBanned) throw new ForbiddenException('You are not permitted to join access this room');

    const staleDate = new Date(Date.now() - 3_600_000);

    const sessions = await this.sessionModel.find({
      userId: { $ne: userId },
      updatedAt: { $gt: staleDate },
      connected: true
    }).exec();

    return sessions.map(session => new RoomSessionEntity(session.toObject()))
  }

  async findRoomWithSubscriber(userId: string, roomId: string) {
    const membership = await this.memberModel.findOne({
      userId, roomId
    }).exec();
    const roomDoc = await this.model.findById(roomId).exec();

    if (!membership || !roomDoc) throw new NotFoundException('Room not found');
    if (membership.isBanned) throw new ForbiddenException('You are not permitted to join access this room');

    return new RoomEntity(roomDoc.toObject());
  }

  async getSubscribedRoomsFor(userId: string) {
    const memberships = await this.memberModel.find({
      isBanned: { $ne: true },
      userId
    }).exec();

    return await Promise.all(memberships.map(doc => doc.roomId)
      .map(roomId => this.model.findById(roomId).exec().then(doc => new RoomEntity(doc.toObject()))));
  }

  async validateRoomMembership(roomId: string, { id }: UserEntity): Promise<[RoomEntity, RoomMemberEntity]> {
    const roomDoc = await this.model.findById(roomId);
    if (!roomDoc) throw new NotFoundException(`Room not found`);

    const memberDoc = await this.memberModel.findOne({
      _id: { $in: roomDoc.members },
      userId: id
    });

    if (!memberDoc) throw new ForbiddenException(`Not a member of the room specified`);
    return [new RoomEntity(roomDoc.toObject()), new RoomMemberEntity(memberDoc.toObject())];
  }

  async createRoom(name: string, userId: string) {
    const dbSession = await this.model.startSession();

    return await dbSession
      .withTransaction(async () => {
        const roomModel = await new this.model({
          name,
          members: [],
        });

        const memberModel = await new this.memberModel({
          userId,
          isBanned: false,
          roomId: roomModel,
          role: 'owner',
        });

        roomModel.set({ members: [memberModel] })
        const ans = await Promise.all([memberModel.save(), roomModel.save()])
        // await dbSession.commitTransaction();
        return ans;
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

            router.observer.on('close', () => {
              this.logger.verbose(`Router::${router.id} closed on worker::${worker.pid}`);
            })

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

                producer.observer.on('close', () => {
                  this.logger.verbose(`Producer::${producer.id} closed on transport::${transport.id}`)
                })
              });

              transport.observer.on('newconsumer', (consumer) => {
                this.logger.verbose(
                  `New Consumer::${consumer.id} on transport::${transport.id}`
                );

                consumer.observer.on('close', () => {
                  this.logger.verbose(`Consumer::${consumer.id} closed on transport::${transport.id}`);
                })
              });
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

    this.logger.verbose('Resolving IP address...');
    from(Object.values(networkInterfaces())).pipe(
      mergeMap(identity),
      filter(({ family, internal }) => family == 'IPv4' && !internal),
      take(1)
    ).subscribe(({ address }) => {
      ip = address;
      this.logger.log(`IP Address resolved to: ${ip}`);
    })
  }

  beforeApplicationShutdown() {
    this.logger.verbose('Shutting down workers...');
    this.workers.forEach((worker) => worker.close());
  }

  async closeProducer(userId: string, sessionId: string, producerId: string) {
    const sessionDoc = await this.sessionModel.findById(sessionId);
    const isSessionOwner = await this.isSessionOwner(sessionId, userId);
    const hasElevatedPrivileges = await this.userHasElevatedPrivileges(sessionDoc.member);

    if (!isSessionOwner && !hasElevatedPrivileges) throw new ForbiddenException('Operation denied!');

    const producer = this.producers[producerId];
    if (!producer) {
      this.logger.warn('Producer::' + producerId + ' not found or already closed');
    }

    producer.close();
  }

  private async userHasElevatedPrivileges(memberId: string) {
    const memberDoc = await this.memberModel.findById(memberId);
    if (!memberDoc) return false;

    return !memberDoc.isBanned && (memberDoc.role == 'owner' || memberDoc.role == 'moderator');
  }

  private async isUserARoomMember(userId: string, roomId: string) {
    const membership = await this.memberModel.exists({
      isBanned: { $ne: true },
      userId,
      roomId
    }).exec();

    return membership != null;
  }

  async isSessionOwner(sessionId: string, userId: string) {
    return await this.sessionModel.exists({
      userId, _id: new Types.ObjectId(sessionId)
    }).exec().then(doc => !!doc)
  }

  async joinSession(sessionId: string, roomId: string, userId: string) {
    this.logger.verbose(`Attempting to add user: ${userId} to session: ${sessionId} in room: ${roomId}...`);
    const isMember = await this.isUserARoomMember(userId, roomId);
    if (!isMember) throw new ForbiddenException('You are not permitted to access this room');

    const isSessionOwner = this.isSessionOwner(sessionId, userId);

    const transportId = computeTransportId(userId, sessionId);
    const { iceParameters, iceCandidates, dtlsParameters, id } = await this.assertWebRtcTransport(sessionId, transportId);
    const rtpCapabilities = this.routerWebRtcServerMap[sessionId].router.rtpCapabilities;

    this.logger.verbose(`User: ${userId} has been added to ${isSessionOwner ? 'their own' : 'the'} session: ${sessionId} in room: ${roomId} successfully. Awaiting final connection to their WebRTC transport`);
    return { isSessionOwner, params: { rtpCapabilities, transportParams: { iceParameters, iceCandidates, dtlsParameters, id } } };
  }

  async createProducer(sessionId: string, userId: string, rtpParameters: RtpParameters, kind: MediaKind) {
    const transportId = computeTransportId(userId, sessionId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) {
      throw new Error('Transport not found or closed');
    }

    const producer = await transport.produce({ kind, rtpParameters });
    this.producers[producer.id] = producer;
    const sessionDoc = await this.sessionModel.findById(sessionId).exec();
    await sessionDoc.updateOne({
      $inc: { __v: 1 },
      $push: {
        producers: producer.id
      }
    }).exec();

    producer.observer.on('close', async () => {
      const { roomId } = await this.memberModel.findById(sessionDoc.member).exec();
      const index = sessionDoc.producers.findIndex(x => x == producer.id);
      if (index >= 0)
        await sessionDoc.updateOne({
          $inc: { __v: 1 },
          $set: {
            producers: sessionDoc.producers.filter(x => x != producer.id)
          }
        });
      delete this.producers[producer.id];
    })

    return { producerId: producer.id };
  }

  async connectTransport(sessionId: string, dtlsParameters: DtlsParameters, userId: string) {
    const transportId = computeTransportId(userId, sessionId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) throw new NotFoundException('No such transport exists: ' + transportId)
    return await transport.connect({ dtlsParameters })
      .then(async () => {
        await this.sessionModel.findByIdAndUpdate(sessionId, {
          $set: {
            connected: true
          }
        }).exec();
      })
      .then(() => this.logger.verbose(`User: ${userId} has connected their WebRTC transport::${transport.id} on session: ${sessionId}`));
  }

  async assertSession(roomId: string, userId: string, clientIp: string, displayName: string) {
    const memberDoc = await this.memberModel.findOne({
      userId: userId,
      roomId
    });

    if (!memberDoc) throw new NotFoundException('Room not found');
    if (memberDoc.isBanned) throw new ForbiddenException('You are forbidden to access this room');

    const staleDate = new Date(Date.now() - 3_600_000);
    let sessionDoc = await this.sessionModel.findOne({
      clientIp,
      serverIp: ip,
      userId,
      member: memberDoc._id,
      updatedAt: {
        $gte: staleDate
      }
    }).exec();

    if (!sessionDoc) {
      sessionDoc = await new this.sessionModel({
        userId,
        member: memberDoc,
        serverIp: ip,
        displayName,
        connected: false,
        clientIp
      }).save();

      this.logger.verbose(`Using new session: ${sessionDoc._id.toString()} for user: ${userId}`)
    } else {
      this.logger.verbose(`Reusing session: ${sessionDoc._id.toString()} for user: ${userId}`);
      await sessionDoc.updateOne({ $inc: { __v: 1 } }).exec();
    }

    const session = new RoomSessionEntity(sessionDoc.toObject());
    return session;
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
