import { Room } from '@chattr/dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { App } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { createWorker } from 'mediasoup';
import { Worker } from 'mediasoup/node/lib/types';
import { cpus } from 'os';
import { forkJoin, generate, mergeMap, of } from 'rxjs';

@Injectable()
export class RoomService {
    private readonly logger = new Logger(RoomService.name);
    private readonly workers = Array<Worker>(Math.min(5, cpus().length));
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

}
