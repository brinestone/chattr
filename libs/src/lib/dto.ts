export type User = {
  email?: string;
  uid?: string;
  picture?: string;
};

export type RoomMemberRole = 'member' | 'owner' | 'moderator';

export type RoomMemberSession = {
  serverIp: string;
  clientIp: string;
  id: string;
  startDate: number;
  endDate?: number;
  sessionOwner: string;
  producers: string[];
};

export type RoomMember = {
  uid: string;
  isBanned: boolean;
  role: string;
};

export type Room = {
  name: string;
  ref?: string;
  memberUids: string[];
  dateCreated?: number;
};
