import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Socket } from "socket.io";
import { Request } from 'express';
import { Observable } from "rxjs";
import { Reflector } from "@nestjs/core";
import { ALLOW_ANONYMOUS } from "../decorators/public-route.decorator";

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
    constructor(private reflector: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(ALLOW_ANONYMOUS, [context.getHandler(), context.getClass()]);
        return isPublic ? true : super.canActivate(context);
    }
    getRequest(context: ExecutionContext) {
        if (context.getType() == 'ws') return context.switchToWs().getClient<Socket>().request;
        return context.switchToHttp().getRequest<Request>();
    }
}
