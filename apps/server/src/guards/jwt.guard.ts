import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Socket } from "socket.io";
import { Request } from 'express';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
    getRequest(context: ExecutionContext) {
        if (context.getType() == 'ws') return context.switchToWs().getClient<Socket>().request;
        return context.switchToHttp().getRequest<Request>();
    }
}
