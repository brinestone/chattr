import { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Socket } from "socket.io";
import { RoomService } from "../services/room.service";
import { Principal } from "../models";
import { RoomMemberRole } from "@chattr/interfaces";
import { ROOM_ROLE } from "../decorators/room-role";

export class RoleGuard implements CanActivate {
    constructor(private roomService: RoomService, private reflector: Reflector) { }

    async canActivate(context: ExecutionContext) {
        const roles = this.reflector.getAllAndOverride<RoomMemberRole[]>(ROOM_ROLE, [context.getHandler(), context.getClass()]);

        if (roles.length == 0) return true;
        const socket = context.switchToWs().getClient<Socket>();
        const principal = (socket.request as unknown as { user: Principal }).user;
        const roomId = socket.data['roomId'];
        if (!principal || !roomId) return false;

        const isInRole = await this.roomService.isMemberInRoles(principal.userId, roomId, roles);
        return isInRole;
    }

}
