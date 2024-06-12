import { User } from '@chattr/interfaces';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WsException } from '@nestjs/websockets';
import { Request } from 'express';
import { Model } from 'mongoose';
import {
  EmptyError,
  catchError,
  combineLatestWith,
  first,
  from,
  map,
  of,
  tap,
  throwError,
} from 'rxjs';
import { Socket } from 'socket.io';
import { AppSession, UserEntity } from '../models';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<User>
  ) {}
  canActivate(context: ExecutionContext) {
    this.logger.verbose(`Authenticating "${context.getType()}" request...`);
    const verificationResult$ =
      context.getType() == 'ws'
        ? this.verifyAuthWs(context)
        : this.verifyAuthHttp(context);
    return verificationResult$.pipe(
      tap(([user, request]) => {
        (request as unknown)['user'] = user;
      }),
      map(() => true)
    );
  }

  private verifyAuthHttp(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const idToken = (request.session as AppSession).userId;
    return this.doVerification(idToken).pipe(combineLatestWith(of(request)));
  }

  private verifyAuthWs(context: ExecutionContext) {
    const request = context.switchToWs().getClient<Socket>().request;
    const url = new URL(`${request.headers.origin}${request.url}`);
    const idToken = url.searchParams.get('token');
    return this.doVerification(idToken).pipe(combineLatestWith(of(request)));
  }

  private doVerification(idToken?: string) {
    this.logger.verbose(`Verifying Auth ID token...`);
    if (!idToken)
      return throwError(
        () =>
          new WsException('401 - Unauthorized. Please sign into your account')
      );

    return from(this.userModel.findById(idToken).exec()).pipe(
      first((doc) => !!doc),
      catchError((error: Error) => {
        return throwError(() => {
          return error instanceof EmptyError
            ? new WsException(
                '401 - Unauthorized. Please sign into your account'
              )
            : error;
        });
      })
    );
  }
}
