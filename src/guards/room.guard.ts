import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";

@Injectable()
export class RoomGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        const pattern = context.switchToWs().getPattern();
        // throw new WsException('You are not a member of this room');
        return true;
    }
}