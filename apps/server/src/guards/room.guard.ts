import { Room, User } from '@chattr/dto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { App } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import {
  EmptyError,
  catchError,
  first,
  forkJoin,
  from,
  map,
  tap,
  throwError,
} from 'rxjs';
import { Socket } from 'socket.io';

@Injectable()
export class RoomGuard implements CanActivate {
  private readonly db: Firestore;
  private readonly logger = new Logger(RoomGuard.name);
  constructor(@Inject('FIREBASE') app: App) {
    this.db = getFirestore(app);
  }
  canActivate(context: ExecutionContext) {
    this.logger.verbose(`Authenticating "${context.getType()}" request...`);
    const [roomArg] = context
      .switchToWs()
      .getData<[{ roomId: string }, unknown]>();
    const request = context.switchToWs().getClient<Socket>().request;
    const user = (request as any)['user'] as User;
    if (!roomArg) throw new WsException(`403 - Room not specified`);
    const { roomId } = roomArg;
    return forkJoin([
      this.db.doc(`rooms/${roomId}`).get(),
      this.db.doc(`rooms/${roomId}/members/${user.uid}`).get(),
    ]).pipe(
      first(([room, member]) => {
        const ans =
          room.exists && member.exists && member.data()['isBanned'] === false;
        return ans;
      }),
      tap(([roomSnapshot, memberSnapshot]) => {
        (request as any)['room'] = {
          ...roomSnapshot.data(),
          ref: roomSnapshot.id,
        };
        (request as any)['roomMember'] = memberSnapshot.data();
      }),
      catchError((error: Error) =>
        throwError(() => {
          if (error instanceof EmptyError) {
            this.logger.verbose(`Request authorization failed`);
            return new WsException(
              `403 - Insuficient permissions to access the room specified. Please contact the owner`
            );
          }
          return error;
        })
      ),
      map(() => true)
    );
  }
}
