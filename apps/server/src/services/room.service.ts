import { Presentation, Room, RoomMembership, RoomSession, User } from '@chattr/domain';
import { ICreateRoomInviteRequest, IRoomMembership, RoomMemberRole } from '@chattr/interfaces';
import { ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown, PreconditionFailedException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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
  TransportProtocol,
  WebRtcServer,
  WebRtcTransport,
  Worker
} from 'mediasoup/node/lib/types';
import { ClientSession, HydratedDocument, Model, Types } from 'mongoose';
import { cpus, networkInterfaces } from 'os';
import {
  EMPTY,
  concatMap,
  first,
  forkJoin,
  from,
  identity,
  interval,
  last,
  mergeMap,
  of,
  switchMap
} from 'rxjs';
import { Events } from '../events';
import { InvitationEventData, UpdatesService } from './updates.service';
import { UserService } from './user.service';

const ONE_HOUR = 3_600_000;
const ROOM_ACCESS_DENIED = 'You are not permitted to access this room';
const MSG_OPERATION_NOT_ALLOWED = 'Operation not allowed';
// const INVITATION_PENDING = 'Your invitation into this room has not yet been accepted';
const MSG_PRESENTATION_NOT_FOUND = 'Presentation not found';

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

function computeTransportTrackingId(userId: string, sessionId: string) {
  return generateUniqueCode(userId, sessionId);
}

@Injectable()
export class RoomService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RoomService.name);
  private readonly workers = Array<Worker>(Math.min(5, cpus().length));
  private readonly webRtcServers = Array<WebRtcServer>(this.workers.length);
  private readonly routers: Record<string, Router> = {};
  private readonly webRtcTransports: Record<string, WebRtcTransport> = {};
  private readonly producers: Record<string, Producer> = {};
  private readonly consumers: Record<string, Consumer> = {};
  private nextWorkerIndex = -1;
  constructor(
    private eventEmitter: EventEmitter2,
    @InjectModel(Room.name) private model: Model<Room>,
    @InjectModel(RoomMembership.name)
    private memberModel: Model<RoomMembership>,
    @InjectModel(Presentation.name) private presentationModel: Model<Presentation>,
    private configService: ConfigService,
    @InjectModel(RoomSession.name)
    private sessionModel: Model<RoomSession>,
    private updatesService: UpdatesService,
    private userService: UserService
  ) {
  }

  private get nextWorker() {
    return this.workers[++this.nextWorkerIndex % this.workers.length];
  }

  async createPresentationConsumer(presentationId: string, userId: string, producerId: string, rtpCapabilities: RtpCapabilities) {
    const transportId = computeTransportTrackingId(userId, presentationId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) {
      throw new Error('Transport not found or closed');
    }

    const presentation = await this.presentationModel.findById(presentationId).exec();
    if (!presentation) throw new NotFoundException(MSG_PRESENTATION_NOT_FOUND);

    const router = this.routers[presentation.room.toString()];
    if (!router.canConsume({ producerId, rtpCapabilities })) throw new Error('Unable to consume presentation');

    const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
    this.consumers[consumer.id] = consumer;
    return { id: consumer.id, rtpParameters: consumer.rtpParameters };
  }

  async createPresentationProducer(presentationId: string, userId: string, rtpParameters: RtpParameters) {
    const transportId = computeTransportTrackingId(userId, presentationId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) {
      throw new Error('Transport not found or closed');
    }

    const presentation = await this.presentationModel.findById(presentationId).exec();
    if (!presentation) throw new NotFoundException(MSG_PRESENTATION_NOT_FOUND);

    const producer = await transport.produce({ kind: 'video', rtpParameters });
    producer.appData.presentationId = presentationId;
    producer.appData.roomId = presentation.room.toString();
    this.producers[producer.id] = producer;
    const sessionDoc = await this.sessionModel.findById(presentation.parentSession).exec();
    await sessionDoc.updateOne({
      $inc: { __v: 1 },
      $push: {
        producers: producer.id
      }
    }).exec();

    producer.observer.on('close', async () => {
      const index = sessionDoc.producers.findIndex(x => x == producer.id);
      if (index >= 0)
        await sessionDoc.updateOne({
          $inc: { __v: 1 },
          $set: {
            producers: sessionDoc.producers.filter(x => x != producer.id)
          }
        });
      delete this.producers[producer.id];
    });

    return { producerId: producer.id };
  }

  async connectPresentationTransport(presentationId: string, dtlsParameters: DtlsParameters, userId: string) {
    const transportTrackingId = computeTransportTrackingId(userId, presentationId);
    const transport = this.webRtcTransports[transportTrackingId];
    if (!transport) throw new NotFoundException(`No such transport: ${transportTrackingId} exists`);

    const presentation = await this.presentationModel.findById(presentationId).exec();
    if (!presentation) throw new NotFoundException(MSG_PRESENTATION_NOT_FOUND);

    this.sessionModel.findByIdAndUpdate(presentation.parentSession, {
      $inc: {
        __v: 1
      },
      $set: {
        connected: true
      }
    }).exec();

    return await transport.connect({ dtlsParameters })
      .catch((err: Error) => {
        if (err.message == 'connect() already called [method:webRtcTransport.connect]') return;
        throw err
      })
      .then(() => this.logger.debug(`User: ${userId} has connected their WebRTC transport::${transport.id} on presentation: ${presentationId}`));
  }

  observeStats(type: 'producer' | 'consumer', id: string) {
    const target: Producer | Consumer = type == 'producer' ? this.producers[id] : this.consumers[id];
    if (!target) {
      this.logger.warn(`Cannot open stats observer for ${type}::${id} because it was not found`);
      return EMPTY;
    }
    return interval(5000).pipe(
      mergeMap(() => from(target.getStats()).pipe(
        switchMap(identity),
        last()
      )),
    )
  }

  async leaveSessions(userId: string, ...sessionIds: string[]) {
    if (sessionIds.length == 0) return;
    this.logger.debug(`User: ${userId} is leaving sessions: ${sessionIds}...`);
    const now = new Date();

    for (const sessionId of sessionIds) {
      const transportId = computeTransportTrackingId(userId, sessionId);
      const transport = this.webRtcTransports[transportId];
      transport?.close();

      const sessionDoc = await this.sessionModel.findById(sessionId);
      if (!sessionDoc) {
        this.logger.warn(`Could not find session: ${sessionId} while attempting to leave with user: ${userId}`);
        continue;
      }

      sessionDoc.updateOne({
        $inc: { __v: 1 },
        $set: {
          producers: [],
          connected: false,
          endDate: now
        }
      }).exec();
    }
  }

  async toggleConsumer(consumerId: string) {
    const consumer = this.consumers[consumerId];
    if (!consumer) throw new NotFoundException('Consumer not found');
    if (consumer.paused) await consumer.resume();
    else
      await consumer.pause();

    const ans = { paused: consumer.paused };
    return ans;
  }

  async isMemberInRoles(userId: string, roomId: string, ...roles: RoomMemberRole[]) {
    const member = await this.memberModel.exists({
      userId,
      roomId,
      isBanned: { $ne: true },
      pending: { $ne: true },
      $or: [
        { role: 'owner' },
        { role: { $in: roles } }
      ]
    });

    return !!member;
  }

  async admitMember(userId: string, memberId: string, displayName: string, roomId: string, clientIp: string, avatar?: string) {
    this.logger.debug(`Admission approved for user: ${userId} into the room: ${roomId}`);
    const staleDate = new Date(Date.now() - ONE_HOUR);
    const sessionExists = await this.sessionModel.exists({
      clientIp,
      serverIp: ip,
      userId,
      member: memberId,
      updatedAt: {
        $gte: staleDate
      }
    });
    if (sessionExists) throw new UnprocessableEntityException('Member specified has already been admitted');
    const session = await new this.sessionModel({
      userId,
      member: memberId,
      roomId,
      serverIp: ip,
      displayName,
      avatar,
      connected: false,
      clientIp
    }).save();

    return new RoomSession(session.toObject());
  }

  async createInvite(request: ICreateRoomInviteRequest, invitorId: string) {
    const session = await this.model.startSession();
    try {
      const ans = await session.withTransaction(async () => {
        const memberDoc = await this.memberModel.findOne({
          isBanned: { $ne: true },
          pending: { $ne: true },
          userId: invitorId,
          roomId: request.roomId
        }, undefined, { session });
        const hasElevatedPrivileges = await this.userHasElevatedPrivileges(memberDoc, session);

        if (!hasElevatedPrivileges) throw new ForbiddenException('Operation denied');

        if (request.userId && await this.isUserARoomMember(request.userId, request.roomId)) throw new ConflictException('The specified user is already a member of the room specified');
        const [url, inviteId] = await this.updatesService.createInvite(request, memberDoc._id.toString(), session);
        if (request.userId) {
          const room = await this.model.findById(request.roomId);
          const invitor = await this.userService.findByIdInternalAsync(invitorId);

          await new this.memberModel({
            isBanned: false,
            pending: true,
            roomId: request.roomId,
            userId: request.userId,
            inviteId,
            role: 'guest'
          }).save({ session });

          this.updatesService.createNotification({
            body: `${invitor.name} invites you to join them in ${room.name} as a guest`,
            sender: invitorId,
            title: 'Invitation',
            image: invitor.avatar,
            to: request.userId,
            data: {
              url
            }
          }, session);
        }
        return url;
      });
      await session.commitTransaction();
      return ans;
    } catch (err) {
      await session.abortTransaction()
      throw err
    } finally {
      await session.endSession()
    }
  }

  async findSessionById(sessionId: string) {
    const sessionDoc = await this.sessionModel.findById(sessionId);
    if (!sessionDoc) throw new NotFoundException('Session not found');

    return new RoomSession(sessionDoc.toObject());
  }

  closeConsumer(consumerId: string) {
    const consumer = this.consumers[consumerId];
    consumer?.close();
    delete this.consumers[consumerId];
  }

  async closeSession(id: string) {
    this.logger.debug(`Closing session: ${id}`);
    const sessionDoc = await this.sessionModel.findById(id);
    const memberDoc = await this.memberModel.findById(sessionDoc.member);
    const transportId = computeTransportTrackingId(sessionDoc.userId, id);
    const transport = this.webRtcTransports[transportId];
    transport?.close();
    await sessionDoc.updateOne({
      $inc: { __v: 1 },
      $set: {
        producers: [],
        connected: false,
        endDate: new Date()
      }
    }).exec();
    await memberDoc.set({
      activeSession: null
    }).save();
  }

  async createConsumer(sessionId: string, userId: string, producerId: string, rtpCapabilities: RtpCapabilities) {
    const transportId = computeTransportTrackingId(userId, sessionId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) throw new NotFoundException('Transport not found');

    const session = await this.sessionModel.findById(sessionId);
    const member = await this.memberModel.findById(session.member);
    const roomId = member.roomId;
    const router = this.routers[roomId.toString()];
    if (!router.canConsume({ producerId, rtpCapabilities })) throw new UnprocessableEntityException('The producer media cannot be consumed');

    const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
    this.consumers[consumer.id] = consumer;
    return { rtpParameters: consumer.rtpParameters, kind: consumer.kind, id: consumer.id, type: consumer.type };
  }

  async findConnectableSessionsFor(roomId: string, userId: string) {
    const membership = await this.memberModel.findOne({
      userId, roomId
    }).exec();
    const roomDoc = await this.model.findById(roomId).exec();

    if (!membership || !roomDoc) throw new NotFoundException('Room not found');
    if (membership.isBanned || membership.pending) throw new ForbiddenException(ROOM_ACCESS_DENIED);

    const otherMembers = await this.memberModel.find({
      roomId,
      userId: { $ne: userId },
      activeSession: { $ne: null }
    }).exec();

    const sessions = await this.sessionModel.find({
      _id: { $in: otherMembers.map(m => m.activeSession) }
    }).exec();

    const ans = sessions.filter(sessionDoc => {
      const sessionTransportId = computeTransportTrackingId(sessionDoc.userId, sessionDoc._id.toString());
      const sessionTransport = this.webRtcTransports[sessionTransportId];
      if (sessionTransport?.closed === false) return true;
      this.memberModel.updateOne({ _id: sessionDoc.member }, {
        $inc: { __v: 1 },
        $set: {
          activeSession: null
        }
      }).exec();
      sessionDoc.set({
        connected: false,
        producers: []
      }).save();

      return false;
    })
      .map(doc => new RoomSession(doc.toObject()));
    return ans;
  }

  async findRoomWithSubscriber(userId: string, roomId: string) {
    const membership = await this.memberModel.findOne({
      userId, roomId
    }).exec();
    const roomDoc = await this.model.findById(roomId).exec();

    if (!membership || !roomDoc) throw new NotFoundException('Room not found');
    if (membership.isBanned || membership.pending) throw new ForbiddenException(ROOM_ACCESS_DENIED);

    return new Room(roomDoc.toObject());
  }

  async getSubscribedRoomsFor(userId: string) {
    const memberships = await this.memberModel.find({
      isBanned: { $ne: true },
      pending: { $ne: true },
      userId
    }).exec();

    return await Promise.all(memberships.map(doc => doc.roomId)
      .map(roomId => this.model.findById(roomId).exec().then(doc => new Room(doc.toObject()))));
  }

  async validateRoomMembership(roomId: string, { id }: User): Promise<[Room, IRoomMembership]> {
    const roomDoc = await this.model.findById(roomId);
    if (!roomDoc) throw new NotFoundException(`Room not found`);

    const memberDoc = await this.memberModel.findOne({
      _id: { $in: roomDoc.members },
      userId: id
    });

    if (!memberDoc) throw new ForbiddenException(ROOM_ACCESS_DENIED);
    return [new Room(roomDoc.toObject()), new RoomMembership(memberDoc.toObject())];
  }

  async createRoom(name: string, userId: string) {
    const dbSession = await this.model.startSession();
    try {
      const ans = await dbSession
        .withTransaction(async () => {
          const roomModel = new this.model({
            name,
            members: [],
          });

          const memberModel = new this.memberModel({
            userId,
            isBanned: false,
            pending: false,
            roomId: roomModel,
            role: 'owner',
          });

          roomModel.set({ members: [memberModel] });
          // const ans = await Promise.all([memberModel.save(), roomModel.save()])
          // await dbSession.commitTransaction();

          return [await memberModel.save({ session: dbSession }), await roomModel.save({ session: dbSession })];
        })
        .then(([member]) => member);
      await dbSession.commitTransaction();
      return ans;
    } catch (err) {
      await dbSession.abortTransaction();
      throw err
    } finally {
      await dbSession.endSession();
    }
  }

  onApplicationBootstrap() {
    this.logger.debug('Starting workers...');
    from(this.workers)
      .pipe(
        concatMap((_, index) =>
          forkJoin([
            createWorker({
              logLevel: 'debug',
              rtcMaxPort: this.configService.getOrThrow<number>('RTC_MAX_PORT'),
              rtcMinPort: this.configService.getOrThrow<number>('RTC_MIN_PORT'),
              dtlsCertificateFile: this.configService.get<string>('DTLS_CERT_PATH'),
              dtlsPrivateKeyFile: this.configService.get<string>('DTLS_PRIVATE_KEY'),
            }),
            of(index),
          ]).pipe(
            concatMap(([worker, index]) => forkJoin([
              of(worker),
              worker.createWebRtcServer({
                listenInfos: [
                  {
                    ip: '0.0.0.0',
                    announcedAddress: ip,
                    protocol: this.configService.get<TransportProtocol>('TRANSPORT_PROTOCOL', 'udp'),
                  },
                ],
              }),
              of(index)
            ]))
          )
        )
      )
      .subscribe({
        next: ([worker, server, index]) => {
          this.logger.debug(`worker::${worker.pid}::create`);
          this.logger.debug(`WebRtc Server::${server.id}::create`);
          worker.appData.index = index;
          this.workers[index] = worker;
          this.webRtcServers[index] = server;

          server.observer.on('close', () => {
            this.logger.debug(
              `WebRTC server::${server.id} closed on worker::${worker.pid}`
            );
          });

          worker.observer.on('newrouter', async (router) => {
            router.appData.serverIndex = index;
            this.logger.debug(
              `New router::${router.id} on worker::${worker.pid}`
            );

            const speakerObserver = await router.createActiveSpeakerObserver({
              interval: 1500
            });
            const volumeObserver = await router.createAudioLevelObserver({
              interval: 1500
            });

            this.logger.debug(`Speaker observer::${speakerObserver.id} created on router::${router.id}`);

            speakerObserver.on('@close', () => {
              this.logger.debug(`Speaker observer::${speakerObserver.id} closed on router::${router.id}`);
            });

            speakerObserver.on('dominantspeaker', ({ producer }) => {
              const { roomId, sessionId } = producer.appData;
              this.eventEmitter.emitAsync(Events.ActiveSessionChanged, { roomId, sessionId });
              this.logger.verbose(`Speaking session changed in room::${roomId} to session::${sessionId}`)
            });

            router.observer.on('close', () => {
              this.logger.debug(`Router::${router.id} closed on worker::${worker.pid}`);
            })

            router.observer.on('newtransport', (transport) => {
              this.logger.debug(
                `New transport::${transport.id} on router::${router.id}`
              );

              transport.observer.on('close', () => {
                this.logger.debug(
                  `Transport::${transport.id} closed on router::${router.id}`
                );
                delete this.webRtcTransports[transport.appData.trackingId as string];
              });

              transport.observer.on('newproducer', async (producer) => {
                console.count('newproducer');
                this.logger.debug(
                  `New Producer::${producer.id} on transport::${transport.id}`
                );

                producer.observer.on('close', async () => {
                  this.logger.debug(`Producer::${producer.id} closed on transport::${transport.id}`);
                  delete this.producers[producer.id];
                  if (producer.kind == 'audio') {
                    try {
                      await speakerObserver.removeProducer({ producerId: producer.id });
                    } catch (err) {
                      this.logger.error(err.message);
                    }
                  }
                });

                if (producer.kind == 'audio') {
                  await speakerObserver.addProducer({ producerId: producer.id });
                  await volumeObserver.addProducer({ producerId: producer.id });
                }
              });

              transport.observer.on('newconsumer', (consumer) => {
                this.logger.debug(
                  `New Consumer::${consumer.id} on transport::${transport.id}, consuming producer::${consumer.producerId}`
                );

                consumer.observer.on('close', () => {
                  this.logger.debug(`Consumer::${consumer.id} closed on transport::${transport.id}`);
                  delete this.consumers[consumer.id];
                })
              });
            });
          });
        },
        complete: () =>
          this.logger.debug(
            `${this.workers.length} workers started successfully`
          ),
        error: (error: Error) => {
          this.logger.error(error.message, error.stack);
        },
      });

    if (this.configService.get<string>('NODE_ENV') === 'development') {
      this.logger.debug('Resolving IP address...');
      from(Object.values(networkInterfaces())).pipe(
        mergeMap(identity),
        first(({ family, internal }) => family == 'IPv4' && !internal),
      ).subscribe(({ address }) => {
        ip = address;
        this.logger.log(`IP Address resolved to: ${ip}`);
      });
    } else {
      ip = this.configService.getOrThrow<string>('ANNOUNCED_IP');
    }
  }

  @OnEvent(Events.InvitationDenied)
  async removePendingMembership({ inviteId, roomId, userId }: InvitationEventData) {
    const result = await this.memberModel.deleteOne({
      pending: { $ne: false },
      userId,
      inviteId,
      roomId
    }).exec();

    if (result.deletedCount == 0) this.logger.warn(`Could not remove any pending memberships for user: ${userId} in room: ${roomId} - No memberships were found`);
    else this.logger.debug(`Pending membership for user: ${userId} in room: ${roomId} was removed succesfully`);
  }

  @OnEvent(Events.InvitationAccepted)
  async approveMembership({ inviteId, roomId, userId, targeted }: InvitationEventData) {
    const dbSession = await this.model.db.startSession();
    try {
      await dbSession.withTransaction(async () => {
        let membership: HydratedDocument<RoomMembership>;
        if (targeted) {
          membership = await this.memberModel.findOne({
            userId,
            inviteId,
            isBanned: { $ne: true },
            pending: { $ne: false },
            roomId
          }).exec();

          if (!membership) {
            this.logger.warn(`Could not approve membership of user: ${userId} into room: ${roomId}`);
            return;
          }

          membership.pending = false;
          await membership.save();
        } else {
          membership = await this.memberModel.findOne({
            userId,
            isBanned: { $ne: true },
            pending: { $ne: false },
            roomId
          }).exec();

          if (!membership) {
            membership = await new this.memberModel({
              isBanned: false,
              pending: false,
              roomId: roomId,
              userId: userId,
              inviteId,
              role: 'guest'
            }).save({ session: dbSession });
          } else {
            await membership.set({
              inviteId, pending: false
            }).save({ session: dbSession });
          }
        }
        this.logger.debug(`Membership for user: ${userId} has been approved`);

        await this.model.findByIdAndUpdate(roomId, {
          $push: {
            members: membership
          },
          $inc: {
            __v: 1
          }
        }, { session: dbSession });
      });
      await dbSession.commitTransaction();
    } catch (err) {
      this.logger.error(err.message, err.stack);
      await dbSession.abortTransaction();
    } finally {
      await dbSession.endSession();
    }
  }

  onApplicationShutdown() {
    this.logger.debug('Shutting down workers...');
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
      return;
    }

    producer.close();
  }

  private async userHasElevatedPrivileges(member?: string | HydratedDocument<RoomMembership>, dbSession?: ClientSession) {
    const memberDoc = typeof member == 'string' ? await this.memberModel.findById(member, undefined, { session: dbSession }) : member;
    if (!memberDoc) return false;

    return !memberDoc.isBanned && (memberDoc.role == 'owner' || memberDoc.role == 'moderator');
  }

  private async isUserARoomMember(userId: string, roomId: string) {
    const membership = await this.memberModel.exists({
      isBanned: { $ne: true },
      pending: { $ne: true },
      userId,
      roomId
    }).exec();
    return membership != null;
  }

  async isSessionOwner(session: string | HydratedDocument<RoomSession>, userId: string) {
    return await this.sessionModel.exists({
      userId, _id: typeof session == 'string' ? new Types.ObjectId(session) : session._id
    }).exec().then(doc => doc != null);
  }

  async joinSession(sessionId: string, roomId: string, userId: string) {
    this.logger.debug(`Attempting to add user: ${userId} to session: ${sessionId} in room: ${roomId}...`);
    const isMember = await this.isUserARoomMember(userId, roomId);
    if (!isMember) throw new ForbiddenException(ROOM_ACCESS_DENIED);

    const isSessionOwner = await this.isSessionOwner(sessionId, userId);
    const hasElevatedPrivileges = await this.userHasElevatedPrivileges(userId);

    const transportId = computeTransportTrackingId(userId, sessionId);
    const [router, { iceParameters, iceCandidates, dtlsParameters, id }] = await this.assertWebRtcTransport(roomId, transportId);
    if (!router) throw new InternalServerErrorException('Unknown Error');
    const rtpCapabilities = router.rtpCapabilities;
    await this.sessionModel.findByIdAndUpdate(sessionId, {
      $set: {
        serverIp: ip,
        connected: true,
        endDate: null
      }
    }).exec();

    this.logger.debug(`User: ${userId} has been added to ${isSessionOwner ? 'their own' : 'the'} session: ${sessionId} in room: ${roomId} successfully. Awaiting final connection to their WebRTC transport`);
    return { isSessionOwner, hasElevatedPrivileges, params: { rtpCapabilities, transportParams: { iceParameters, iceCandidates, dtlsParameters, id } } };
  }

  async createSessionProducer(sessionId: string, userId: string, rtpParameters: RtpParameters, kind: MediaKind, roomId: string) {
    const transportId = computeTransportTrackingId(userId, sessionId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) {
      throw new Error('Transport not found or closed');
    }

    const producer = await transport.produce({ kind, rtpParameters });
    producer.appData.sessionId = sessionId;
    producer.appData.roomId = roomId;
    this.producers[producer.id] = producer;
    const sessionDoc = await this.sessionModel.findById(sessionId).exec();
    await sessionDoc.updateOne({
      $inc: { __v: 1 },
      $push: {
        producers: producer.id
      }
    }).exec();

    producer.observer.on('close', async () => {
      const index = sessionDoc.producers.findIndex(x => x == producer.id);
      if (index >= 0)
        await sessionDoc.updateOne({
          $inc: { __v: 1 },
          $set: {
            producers: sessionDoc.producers.filter(x => x != producer.id)
          }
        });
      delete this.producers[producer.id];
    });

    return { producerId: producer.id };
  }

  async connectSessionTransport(sessionId: string, dtlsParameters: DtlsParameters, userId: string) {
    const transportId = computeTransportTrackingId(userId, sessionId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) throw new NotFoundException('No such transport exists: ' + transportId);
    return await transport.connect({ dtlsParameters })
      .then(() => this.logger.debug(`User: ${userId} has connected their WebRTC transport::${transport.id} on session: ${sessionId}`));
  }

  async assertSession(roomId: string, userId: string, clientIp: string, displayName: string, avatar?: string) {
    const memberDoc = await this.memberModel.findOne({
      userId,
      roomId
    });

    if (!memberDoc || memberDoc.isBanned) throw new ForbiddenException(ROOM_ACCESS_DENIED);
    // if (memberDoc.isBanned) throw new ForbiddenException('You are forbidden to access this room');
    if (memberDoc.pending) throw new PreconditionFailedException();

    const staleDate = new Date(Date.now() - ONE_HOUR);
    let sessionDoc = await this.sessionModel.findOne({
      $or: [
        {
          clientIp,
          serverIp: ip,
          userId,
          member: memberDoc,
          updatedAt: {
            $gte: staleDate
          }
        },
        {
          _id: memberDoc.activeSession
        }
      ]
    }).exec();

    if (!sessionDoc) {
      const hasElevatedPrivileges = this.userHasElevatedPrivileges(memberDoc);
      if (!hasElevatedPrivileges) {
        this.eventEmitter.emitAsync(Events.AdmissionPending, { memberId: memberDoc._id.toString(), userId, displayName, avatar, roomId, clientIp });
        this.logger.debug(`User: ${userId} has attempted to join room: ${roomId} but does not have a recent session. Admission is pending`)
        throw new PreconditionFailedException('Please wait for either a moderator or the room owner to admit you into this session');
      }
      sessionDoc = await new this.sessionModel({
        userId,
        member: memberDoc,
        serverIp: ip,
        displayName,
        avatar,
        roomId,
        connected: false,
        clientIp
      }).save();

      this.logger.debug(`Using new session: ${sessionDoc._id.toString()} for user: ${userId}`)
    } else {
      this.logger.debug(`Reusing session: ${sessionDoc._id.toString()} for user: ${userId}`);
      await sessionDoc.updateOne({ $inc: { __v: 1 } }).exec();
    }
    await memberDoc.updateOne({ $inc: { __v: 1 }, $set: { activeSession: sessionDoc } }).exec();

    const session = new RoomSession(sessionDoc.toObject());
    return session;
  }

  private async assertWebRtcTransport(routerID: string, id: string): Promise<[Router, WebRtcTransport]> {
    let transport = this.webRtcTransports[id];
    let router = this.routers[routerID];

    if (!transport) {
      router = this.routers[routerID] ?? (await this.assertRouter(routerID));
      const server = this.webRtcServers[Number(router.appData.serverIndex)];
      transport = await router.createWebRtcTransport({
        webRtcServer: server,
        enableUdp: true,
      });
      this.webRtcTransports[id] = transport;
      transport.appData.trackingId = id;
    }

    return [router, transport];
  }

  private async assertRouter(id: string) {
    let router = this.routers[id];
    if (!router) {
      const worker = this.nextWorker;
      router = await worker.createRouter({
        mediaCodecs,
      });
      this.routers[id] = router;
    }
    return router;
  }

  async assertPresentation(roomId: string, userId: string, displayName?: string) {
    const member = await this.memberModel.findOne({
      userId,
      roomId,
      isBanned: { $ne: true },
      pending: { $ne: true }
    });

    if (!member) throw new ForbiddenException(ROOM_ACCESS_DENIED);
    const { activeSession } = member;

    const parentSession = await this.sessionModel.findById(activeSession);
    if (!parentSession || !activeSession) {
      this.logger.warn(`User: ${userId} has attempted to start a presentation in room: ${roomId} but had no active session`);
      throw new ForbiddenException(MSG_OPERATION_NOT_ALLOWED);
    }

    const { displayName: sessionDisplayName } = parentSession;
    const staleDate = new Date(Date.now() - 3_600_000);
    let previousPresenter: string | undefined = undefined;
    let presentation = await this.presentationModel.findOne({
      updatedAt: { $gte: staleDate },
      room: roomId,
      endedAt: null,
      $or: [
        { parentSession: parentSession._id }
      ]
    })
      .sort({ updatedAt: -1 })
      .populate('owner')
      .exec();
    if (presentation) {
      previousPresenter = (presentation.owner as unknown as HydratedDocument<RoomMembership> | undefined)?.userId?.toString();
      await presentation.set({
        displayName: displayName ?? sessionDisplayName,
        owner: member._id,
        parentSession: parentSession._id
      }).save();
    } else {
      presentation = await new this.presentationModel({
        displayName: displayName ?? sessionDisplayName,
        room: roomId,
        owner: member._id,
        parentSession: parentSession._id
      }).save();
    }

    this.eventEmitter.emitAsync(presentation.__v > 0 ? Events.PresentationCreated : Events.PresentationUpdated, { previousPresenter, timestamp: presentation.updatedAt, presenter: userId, roomId, id: presentation._id.toString() });

    return new Presentation(presentation.toObject());
  }

  async joinPresentation(userId: string, presentationId: string) {
    const presentation = await this.presentationModel.findById(presentationId).populate('parentSession').exec();
    if (!presentation) throw new NotFoundException(MSG_PRESENTATION_NOT_FOUND);

    const memberDoc = await this.memberModel.exists({
      pending: { $ne: true },
      isBanned: { $ne: true },
      userId,
      roomId: presentation.room
    }).exec();

    if (!memberDoc) {
      this.logger.warn(`User: ${userId} has attempted to join the presentation: ${presentationId}, but is not a member of the presentation's room: ${presentation.room.toString()}`);
      throw new ForbiddenException(MSG_OPERATION_NOT_ALLOWED);
    }

    const parentSession = presentation.parentSession as unknown as HydratedDocument<RoomSession>;
    if (!parentSession) {
      this.logger.warn(`Presentation: ${presentationId} was attempted to start, but it's parent session could not be found`);
      throw new ForbiddenException(MSG_OPERATION_NOT_ALLOWED);
    }

    const { room } = presentation;
    const transportId = computeTransportTrackingId(userId, presentationId);
    const [{ rtpCapabilities }, { id, iceCandidates, dtlsParameters, iceParameters }] = await this.assertWebRtcTransport(room.toString(), transportId);
    const isOwner = parentSession.userId.toString() == userId;
    return { rtpCapabilities, transportParams: { id, iceCandidates, dtlsParameters, iceParameters }, isOwner };
  }

  async findPresentation(id: string) {
    const doc = await this.presentationModel.findById(id).exec();

    if (!doc) throw new NotFoundException(MSG_PRESENTATION_NOT_FOUND);

    return new Presentation(doc.toObject());
  }

  async endUserPresentations(userId: string, presentationId: string) {
    const transportId = computeTransportTrackingId(userId, presentationId);
    const transport = this.webRtcTransports[transportId];
    transport?.close();

    const presentation = await this.presentationModel.findByIdAndUpdate(presentationId, {
      $currentDate: {
        endedAt: 1
      },
      $inc: {
        __v: 1
      }
    }).exec();
    if (!presentation) {
      this.logger.warn(`Could not end presentation: ${presentationId} because it does not exist`);
      return;
    }

    this.eventEmitter.emitAsync(Events.PresentationClosed, { owner: userId, id: presentationId, roomId: presentation.room.toString() });
  }

  async findCurrentPresentation(room: string) {
    const staleDate = new Date(Date.now() - 3_600_000); // 1 hour
    const presentation = await this.presentationModel.findOne({
      room,
      updatedAt: { $gte: staleDate },
      endedAt: null
    }).exec();

    if (!presentation) throw new NotFoundException(MSG_PRESENTATION_NOT_FOUND);

    return new Presentation(presentation.toObject());
  }
}
