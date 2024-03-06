import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Socket } from "socket.io";

@Injectable()
export class WsAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToWs().getClient<Socket>().request;
        console.log(request.headers);
        return true;
    }
}