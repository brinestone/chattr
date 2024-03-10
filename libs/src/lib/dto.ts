export type User = {
  email?: string;
  uid?: string;
  picture?: string;
};

export type RoomMemberRole = 'member' | 'owner' | 'moderator';

export type RoomMemberSession = {
  ip: string;
  id: string;
  startDate: number;
  endDate?: number;
  sessionOwner: string;
};

export type RoomMember = {
  uid: string;
  isBanned: boolean;
};

export type Room = {
  name: string;
  id?: string;
  dateCreated?: number;
  members: RoomMember[];
  sessions: Record<string, RoomMemberSession>;
  roleMap: Record<string, RoomMemberRole>;
};
