import { Room, User } from '@chattr/dto';
import {
    CanActivate,
    ExecutionContext,
    Inject,
    Injectable,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { App } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import {
    EmptyError,
    catchError,
    first,
    from,
    map,
    tap,
    throwError,
} from 'rxjs';
import { Socket } from 'socket.io';

@Injectable()
export class RoomGuard implements CanActivate {
    constructor(@Inject('FIREBASE') private readonly app: App) { }
    canActivate(context: ExecutionContext) {
        const [roomArg] = context
            .switchToWs()
            .getData<[{ roomId: string }, unknown]>();
        const request = context.switchToWs().getClient<Socket>().request;
        const user = (context as any)['user'] as User;
        if (!roomArg) throw new WsException(`403 - Room not specified`);
        const db = getDatabase(this.app);
        const { roomId } = roomArg;
        return from(db.ref(`/rooms/${roomId}`).get()).pipe(
            first((snapshot) => snapshot.exists()),
            map((snapshot) => {
                const room = snapshot.val() as Room;
                room.id = snapshot.key;
                return room;
            }),
            first((room) => {
                return (
                    !room.bannedMembers.some((uid) => uid === user.uid) &&
                    !!room.acceptedMembers.find(({ uid }) => uid === user.uid)
                );
            }),
            catchError((error: Error) =>
                throwError(() => {
                    if (error instanceof EmptyError) {
                        return new WsException(
                            `403 - Insuficient permissions to access the room specified. Please contact the owner`,
                        );
                    }
                    return error;
                }),
            ),
            tap((room) => {
                (request as any)['room'] = room;
            }),
            map(() => true),
        );
    }
}
