export interface Entity {
  id: string;
  _v: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface User extends Entity {
  email: string;
  avatar?: string;
}

export type RoomMemberRole = 'member' | 'owner' | 'moderator';

export interface RoomMemberSession extends Entity {
  serverIp: string;
  clientIp: string;
  endDate?: Date;
  member?: string;
  producers: string[];
}

export interface RoomMember extends Entity {
  isBanned: boolean;
  roomId?: string;
  userId?: string;
  role: string;
}

export interface Room extends Entity {
  name: string;
  members: string[];
}

export interface ILoginRequest {
  email: string;
  password: string;
}
