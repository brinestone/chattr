import {
    CanActivate,
    ExecutionContext,
    Inject,
    Injectable,
    Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Request } from 'express';
import { App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { catchError, combineLatestWith, from, map, of, switchMap, tap, throwError } from 'rxjs';
import { Socket } from 'socket.io';

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

    constructor(@Inject('FIREBASE') private readonly app: App) { }
    canActivate(context: ExecutionContext) {
        const verificationResult$ = context.getType() == 'ws' ? this.verifyAuthWs(context) : this.verifyAuthHttp(context);
        return verificationResult$.pipe(
            tap(([{ picture, email, uid }, request]) => {
                (request as any)['user'] = { picture, email, uid };
            }),
            map(() => true)
        )
    }

    private verifyAuthHttp(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<Request>();
        const idToken = request.headers.authorization;
        return this.doVerification(idToken).pipe(
            combineLatestWith(of(request))
        );
    }

    private verifyAuthWs(context: ExecutionContext) {
        const request = context.switchToWs().getClient<Socket>().request;
        const url = new URL(`${request.headers.origin}${request.url}`);
        const idToken = url.searchParams.get('token');
        return this.doVerification(idToken).pipe(
            combineLatestWith(of(request))
        );
    }

    private doVerification(idToken?: string) {
        if (!idToken)
            throw new WsException(
                '401 - Unauthorized. Please sign into your account',
            );

        const auth = getAuth(this.app);
        return from(auth.verifyIdToken(idToken)).pipe(
            switchMap((x) => {
                if (x) return of(x);
                return throwError(
                    () =>
                        new WsException(
                            '401 - Unauthorized. Please sign into your account',
                        ),
                );
            }),
            catchError((error: Error) => throwError(() => {
                this.logger.error(error.message, error.stack);
                console.log(error.name);
                return new WsException(
                    '401 - Unauthorized. Please sign into your account',
                );
            }))
        ); 
    }
}
