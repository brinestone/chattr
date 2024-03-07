import { Inject, Injectable, Logger } from '@nestjs/common';
import { App } from 'firebase-admin/app';
import { Database, getDatabase } from 'firebase-admin/database';
import { createWorker } from 'mediasoup';
import { Worker } from 'mediasoup/node/lib/types';
import { cpus } from 'os';
import { forkJoin, from, generate, map, mergeMap, of } from 'rxjs';
import { Room, RoomMember } from '../models';

@Injectable()
export class RoomService {
    private readonly logger = new Logger(RoomService.name);
    private readonly workers = Array<Worker>(Math.min(5, cpus().length));
    private nextWorkerIndex = -1;
    private readonly db: Database;

    constructor(@Inject('FIREBASE') app: App) {
        this.db = getDatabase(app);
    }

    private get nextWorker() {
        return this.workers[(++this.nextWorkerIndex) % this.workers.length];
    }

    createRoom(name: string, members: RoomMember[]) {
        const ref = this.db.ref('/rooms').push();
        const room = {
            acceptedMembers: members,
            id: ref.key,
            name
        } as Room;
        return from(ref.set(room)).pipe(
            map(() => room)
        );
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
