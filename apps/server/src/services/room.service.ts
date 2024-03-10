import { Room, User } from '@chattr/dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { App } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { createWorker } from 'mediasoup';
import { Router, RtpCodecCapability, WebRtcServer, WebRtcTransport, Worker } from 'mediasoup/node/lib/types';
import { cpus, networkInterfaces } from 'os';
import { forkJoin, from, generate, mergeMap, of, switchMap } from 'rxjs';

const ip = networkInterfaces().eth0[0].address;

const mediaCodecs = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2
    },
    {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters:
        {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1
        }
    }
] as RtpCodecCapability[];

@Injectable()
export class RoomService {
    private readonly logger = new Logger(RoomService.name);
    private readonly workers = Array<Worker>(Math.min(5, cpus().length));
    private readonly routerWebRtcServerMap: {
        [key: string]: {
            router: Router,
            server: WebRtcServer
        }
    } = {};
    private readonly webRtcTransports: { [key: string]: WebRtcTransport } = {};
    private nextWorkerIndex = -1;
    private readonly db: Firestore;

    constructor(@Inject('FIREBASE') app: App) {
        this.db = getFirestore(app);
    }

    private get nextWorker() {
        return this.workers[(++this.nextWorkerIndex) % this.workers.length];
    }

    getRooms() {
        this.db.collection('/');
    }

    async createRoom(_data: Room) {
        const collectionRef = this.db.collection('/rooms');
        const ref = await collectionRef.add({ ..._data, dateCreated: Date.now() } as Room);
        const snapshot = await ref.get()
        return snapshot.data();
    }

    onApplicationBootstrap() {
        this.logger.verbose('Starting workers...');
        generate(0, x => x < this.workers.length, n => n + 1).pipe(
            mergeMap((index) => forkJoin([
                createWorker({
                    logLevel: 'debug',
                    rtcMaxPort: 50000,
                    rtcMinPort: 40000
                }),
                of(index)
            ]))
        ).subscribe({
            next: ([worker, index]) => {
                this.logger.verbose(`worker::${worker.pid}::create`);
                this.workers[index] = worker;

                worker.observer.on('newwebrtcserver', server => {
                    this.logger.verbose(`New WebRTC server::${server.id} on worker::${worker.pid}`);
                    server.observer.on('close', () => {
                        this.logger.verbose(`WebRTC server::${server.id} closed on worker::${worker.pid}`);
                    });
                });

                worker.observer.on('newrouter', router => {
                    this.logger.verbose(`New router::${router.id} on worker::${worker.pid}`);

                    router.observer.on('newtransport', transport => {
                        this.logger.verbose(`New transport::${transport.id} on router::${router.id}`);

                        transport.observer.on('close', () => {
                            this.logger.verbose(`Transport::${transport.id} closed on router::${router.id}`);
                        });

                        transport.observer.on('newproducer', producer => {
                            this.logger.verbose(`New Producer::${producer.id} on transport::${transport.id}`)
                        });

                        transport.observer.on('newconsumer', consumer => {
                            this.logger.verbose(`New Consumer::${consumer.id} on transport::${transport.id}`);
                        });
                    });

                    router.observer.on('close', () => {
                        this.logger.verbose(`Router::${router.id} closed on worker:${worker.pid}`);
                    })
                })
            },
            complete: () => this.logger.verbose(`${this.workers.length} workers started successfully`),
            error: (error: Error) => {
                this.logger.error(error.message, error.stack);
            }
        });
    }

    beforeApplicationShutdown() {
        this.logger.verbose('Shutting down workers...');
        this.workers.forEach(worker => worker.close());
    }

    assertSession(room: Room, user: User) {
        let sessionEntry = Object.entries(room.sessions).find(([id, session]) => {
            return session.ip == ip && !!this.webRtcTransports[id];
        });
        let currentSession = sessionEntry?.[1];

        if (!sessionEntry) {
            const sessionId = randomUUID();
            this.logger.verbose(`Session timed out. Creating new session ${sessionId}`);
            currentSession = {
                id: sessionId,
                ip,
                sessionOwner: user.uid,
                startDate: Date.now()
            };
            room.sessions[currentSession.id] = currentSession;
            from(this.updateRoom(room.id, room)).subscribe({
                error: (error: Error) => this.logger.error(error.message, error.stack),
                complete: () => this.logger.verbose(`Room: ${room.id} updated`)
            }); 
        } else {
            this.logger.verbose(`Reusing session: ${currentSession.id}`);
        }

        return from(this.assertWebRtcTransport(room.id, currentSession.id)).pipe(
            switchMap(({ id, iceCandidates, iceParameters, dtlsParameters, sctpParameters }) => {
                return of({
                    id,
                    iceParameters,
                    iceCandidates,
                    dtlsParameters,
                    sctpParameters
                });
            })
        );
    }

    private async updateRoom(id: string, update: Room) {
        const ref = this.db.doc(`/rooms/${id}`);
        return await ref.update(update);
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
            transport = await router.createWebRtcTransport({ webRtcServer: server, enableUdp: true });
            this.webRtcTransports[id] = transport;
        }

        return transport;
    }

    private async assertRouter(id: string) {
        let entry = this.routerWebRtcServerMap[id];
        if (!entry) {
            const worker = this.nextWorker;
            const router = await worker.createRouter({
                mediaCodecs
            });
            const server = await worker.createWebRtcServer({
                listenInfos: [
                    {
                        ip,
                        protocol: 'udp'
                    }
                ]
            });
            entry = this.routerWebRtcServerMap[id] = { router, server };
        }
        return entry.router;
    }

}
