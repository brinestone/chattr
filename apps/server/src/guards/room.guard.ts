import { User } from '@chattr/interfaces';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WsException } from '@nestjs/websockets';
import { HydratedDocument, Model } from 'mongoose';
import {
  EmptyError,
  catchError,
  first,
  forkJoin,
  map,
  tap,
  throwError,
} from 'rxjs';
import { Socket } from 'socket.io';
import { RoomEntity, RoomMemberEntity } from '../models';

@Injectable()
export class RoomGuard implements CanActivate {
  private readonly logger = new Logger(RoomGuard.name);
  constructor(
    @InjectModel(RoomEntity.name) private roomModel: Model<RoomEntity>,
    @InjectModel(RoomMemberEntity.name)
    private memberModel: Model<RoomMemberEntity>
  ) {}

  canActivate(context: ExecutionContext) {
    this.logger.verbose(`Authenticating "${context.getType()}" request...`);
    const [roomArg] = context
      .switchToWs()
      .getData<[{ roomId: string }, unknown]>();
    const request = context.switchToWs().getClient<Socket>().request;
    const user = (request as unknown)['user'] as HydratedDocument<User>;
    if (!roomArg) throw new WsException(`403 - Room not specified`);
    const { roomId } = roomArg;
    return forkJoin([
      this.roomModel.findById(roomId).exec(),
      this.memberModel.findOne({ userId: user._id, roomId }).exec(),
    ]).pipe(
      first(([room, member]) => {
        const ans = !!room && !!member && member.isBanned === false;
        return ans;
      }),
      tap(([roomDoc, memberDoc]) => {
        (request as unknown)['room'] = roomDoc;
        (request as unknown)['roomMember'] = memberDoc;
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
