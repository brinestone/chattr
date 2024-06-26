import { RoomMemberRole } from "@chattr/interfaces";
import { SetMetadata } from "@nestjs/common";

export const ROOM_ROLE = 'roomRole';
export const Roles = (...roles: RoomMemberRole[]) => SetMetadata(ROOM_ROLE, roles);
