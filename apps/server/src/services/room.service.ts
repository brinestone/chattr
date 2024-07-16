import { ICreateRoomInviteRequest, IRoomMembership, RoomMemberRole } from '@chattr/interfaces';
import { ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown, PreconditionFailedException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import EventEmitter from 'events';
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
  Worker
} from 'mediasoup/node/lib/types';
import { HydratedDocument, Model, Types } from 'mongoose';
import { cpus, networkInterfaces } from 'os';
import {
  concatMap,
  filter,
  forkJoin,
  from,
  fromEvent,
  identity,
  mergeMap,
  of,
  take
} from 'rxjs';
import { Events } from '../events';
import { Room, RoomMembership, RoomSession, User } from '../models';
import { InvitationEventData, UpdatesService } from './updates.service';
import { UserService } from './user.service';

const ONE_HOUR = 3_600_000;

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
export class RoomService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RoomService.name);
  private readonly workers = Array<Worker>(Math.min(5, cpus().length));
  private readonly webRtcServers = Array<WebRtcServer>(this.workers.length);
  private readonly routers: Record<string, Router> = {};
  private readonly webRtcTransports: Record<string, WebRtcTransport> = {};
  private readonly producers: Record<string, Producer> = {};
  readonly observer = new EventEmitter();
  private readonly consumers: Record<string, Consumer> = {};
  private nextWorkerIndex = -1;
  constructor(
    @InjectModel(Room.name) private model: Model<Room>,
    @InjectModel(RoomMembership.name)
    private memberModel: Model<RoomMembership>,
    @InjectModel(RoomSession.name)
    private sessionModel: Model<RoomSession>,
    private updatesService: UpdatesService,
    private userService: UserService
  ) {
  }

  private get nextWorker() {
    return this.workers[++this.nextWorkerIndex % this.workers.length];
  }

  async leaveSessions(userId: string, ...sessionIds: string[]) {
    if (sessionIds.length == 0) return;
    this.logger.verbose(`User: ${userId} is leaving sessions: ${sessionIds}...`);
    const now = new Date();

    for (const sessionId of sessionIds) {
      const transportId = computeTransportId(userId, sessionId);
      const transport = this.webRtcTransports[transportId];
      transport?.close();
      delete this.webRtcTransports[transportId];

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
    this.logger.debug(`Consumer State before toggling: paused = ${consumer.paused}`);
    if (consumer.paused) await consumer.resume();
    await consumer.pause();
    this.logger.debug(`Consumer State after toggling: paused = ${consumer.paused}`);

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
    this.logger.verbose(`Admission approved for user: ${userId} into the room: ${roomId}`);
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
    const memberDoc = await this.memberModel.findOne({
      isBanned: { $ne: true },
      pending: { $ne: true },
      userId: invitorId,
      roomId: request.roomId
    });
    const hasElevatedPrivileges = await this.userHasElevatedPrivileges(memberDoc);

    if (!hasElevatedPrivileges) throw new ForbiddenException('Operation denied');

    if (request.userId && await this.isUserARoomMember(request.userId, request.roomId)) throw new ConflictException('The specified user is already a member of the room specified');
    const [url, inviteId] = await this.updatesService.createInvite(request, memberDoc._id.toString());
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
      }).save();

      this.updatesService.createNotification({
        body: `${invitor.name} invites you to join them in ${room.name} as a guest`,
        sender: invitorId,
        title: 'Invitation',
        image: invitor.avatar,
        to: request.userId,
        data: {
          url
        }
      });
    }
    return url;
  }

  async findSessionById(sessionId: string) {
    const sessionDoc = await this.sessionModel.findById(sessionId);
    if (!sessionDoc) throw new NotFoundException('Session not found');

    return new RoomSession(sessionDoc.toObject());
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
    const memberDoc = await this.memberModel.findById(sessionDoc.member);
    const transportId = computeTransportId(sessionDoc.userId, id);
    const transport = this.webRtcTransports[transportId];
    transport?.close();
    delete this.webRtcTransports[transportId];
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
    const transportId = computeTransportId(userId, sessionId);
    const transport = this.webRtcTransports[transportId];
    if (!transport) throw new NotFoundException('Transport not found');

    const session = await this.sessionModel.findById(sessionId);
    const member = await this.memberModel.findById(session.member);
    const roomId = member.roomId;
    const router = this.routers[roomId.toString()];
    if (!router.canConsume({ producerId, rtpCapabilities })) throw new UnprocessableEntityException('The producer media cannot be consumed');

    const consumer = await transport.consume({ producerId, rtpCapabilities/* , paused: true */ });
    this.consumers[consumer.id] = consumer;
    return { rtpParameters: consumer.rtpParameters, kind: consumer.kind, id: consumer.id, type: consumer.type };
  }

  async findConnectableSessionsFor(roomId: string, userId: string) {
    const membership = await this.memberModel.findOne({
      userId, roomId
    }).exec();
    const roomDoc = await this.model.findById(roomId).exec();

    if (!membership || !roomDoc) throw new NotFoundException('Room not found');
    if (membership.isBanned || membership.pending) throw new ForbiddenException('You are not permitted to access this room');

    const otherMembers = await this.memberModel.find({
      roomId,
      userId: { $ne: userId },
      activeSession: { $ne: null }
    }).exec();

    const sessions = await this.sessionModel.find({
      _id: { $in: otherMembers.map(m => m.activeSession) }
    }).exec();

    const ans = sessions.filter(sessionDoc => {
      const sessionTransportId = computeTransportId(sessionDoc.userId, sessionDoc._id.toString());
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
    if (membership.isBanned) throw new ForbiddenException('You are not permitted to join access this room');

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

    if (!memberDoc) throw new ForbiddenException(`Not a member of the room specified`);
    return [new Room(roomDoc.toObject()), new RoomMembership(memberDoc.toObject())];
  }

  async createRoom(name: string, userId: string) {
    const dbSession = await this.model.startSession();

    return await dbSession
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
          ]).pipe(
            concatMap(([worker, index]) => forkJoin([
              of(worker),
              worker.createWebRtcServer({
                listenInfos: [
                  {
                    ip: '0.0.0.0',
                    announcedAddress: ip,
                    protocol: 'udp',
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
          this.logger.verbose(`worker::${worker.pid}::create`);
          this.logger.verbose(`WebRtc Server::${server.id}::create`);
          worker.appData.index = index;
          this.workers[index] = worker;
          this.webRtcServers[index] = server;

          server.observer.on('close', () => {
            this.logger.verbose(
              `WebRTC server::${server.id} closed on worker::${worker.pid}`
            );
          });

          worker.observer.on('newrouter', (router) => {
            router.appData.serverIndex = index;
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
                  this.logger.verbose(`Producer::${producer.id} closed on transport::${transport.id}`);
                  delete this.producers[producer.id];
                });

              });

              transport.observer.on('newconsumer', (consumer) => {
                this.logger.verbose(
                  `New Consumer::${consumer.id} on transport::${transport.id}`
                );

                consumer.observer.on('close', () => {
                  this.logger.verbose(`Consumer::${consumer.id} closed on transport::${transport.id}`);
                  delete this.consumers[consumer.id];
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
    });

    fromEvent(this.updatesService.observer, Events.InvitationAccepted).subscribe(({ inviteId, roomId, userId, targeted }: InvitationEventData) => {
      this.approveMembership(inviteId, userId, roomId, targeted);
    });

    fromEvent(this.updatesService.observer, Events.InvitationDenied).subscribe(({ inviteId, roomId, userId, targeted }: InvitationEventData) => {
      this.removePendingMembership(inviteId, userId, roomId);
    });
  }

  async removePendingMembership(inviteId: string, userId: string, roomId: string) {
    const result = await this.memberModel.deleteOne({
      pending: { $ne: false },
      userId,
      inviteId,
      roomId
    }).exec();

    if (result.deletedCount == 0) this.logger.warn(`Could not remove any pending memberships for user: ${userId} in room: ${roomId} - No memberships were found`);
    else this.logger.verbose(`Pending membership for user: ${userId} in room: ${roomId} was removed succesfully`);
  }

  async approveMembership(inviteId: string, userId: string, roomId: string, targeted: boolean) {
    try {
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
          }).save();
        } else {
          await membership.set({
            inviteId, pending: false
          }).save();
        }
      }
      this.logger.verbose(`Membership for user: ${userId} has been approved`);

      await this.model.findByIdAndUpdate(roomId, {
        $push: {
          members: membership
        },
        $inc: {
          __v: 1
        }
      });
    } catch (err) {
      this.logger.error(err.message, err.stack);
    }
  }

  onApplicationShutdown() {
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

  private async userHasElevatedPrivileges(member?: string | HydratedDocument<RoomMembership>) {
    const memberDoc = typeof member == 'string' ? await this.memberModel.findById(member) : member;
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
    this.logger.verbose(`Attempting to add user: ${userId} to session: ${sessionId} in room: ${roomId}...`);
    const isMember = await this.isUserARoomMember(userId, roomId);
    if (!isMember) throw new ForbiddenException('You are not permitted to access this room');

    const isSessionOwner = await this.isSessionOwner(sessionId, userId);
    const hasElevatedPrivileges = await this.userHasElevatedPrivileges(userId);

    const transportId = computeTransportId(userId, sessionId);
    const [router, { iceParameters, iceCandidates, dtlsParameters, id }] = await this.assertWebRtcTransport(roomId, transportId);
    if (!router) throw new InternalServerErrorException('Unknown Error');
    const rtpCapabilities = this.routers[roomId].rtpCapabilities;
    await this.sessionModel.findByIdAndUpdate(sessionId, {
      $set: {
        serverIp: ip,
        connected: true,
        endDate: null
      }
    }).exec();

    this.logger.verbose(`User: ${userId} has been added to ${isSessionOwner ? 'their own' : 'the'} session: ${sessionId} in room: ${roomId} successfully. Awaiting final connection to their WebRTC transport`);
    return { isSessionOwner, hasElevatedPrivileges, params: { rtpCapabilities, transportParams: { iceParameters, iceCandidates, dtlsParameters, id } } };
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
    if (!transport) throw new NotFoundException('No such transport exists: ' + transportId);
    return await transport.connect({ dtlsParameters })
      .then(() => this.logger.verbose(`User: ${userId} has connected their WebRTC transport::${transport.id} on session: ${sessionId}`));
  }

  async assertSession(roomId: string, userId: string, clientIp: string, displayName: string, avatar?: string) {
    const memberDoc = await this.memberModel.findOne({
      userId,
      roomId
    });

    if (!memberDoc) throw new NotFoundException('You are not a member of this room');
    if (memberDoc.isBanned) throw new ForbiddenException('You are forbidden to access this room');
    if (memberDoc.pending) throw new PreconditionFailedException('Your invitation into this room has not yet been accepted');

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
        this.observer.emit(Events.AdmissionPending, { memberId: memberDoc._id.toString(), userId, displayName, avatar, roomId, clientIp });
        this.logger.verbose(`User: ${userId} has attempted to join room: ${roomId} but does not have a recent session. Admission is pending`)
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

      this.logger.verbose(`Using new session: ${sessionDoc._id.toString()} for user: ${userId}`)
    } else {
      this.logger.verbose(`Reusing session: ${sessionDoc._id.toString()} for user: ${userId}`);
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
}
