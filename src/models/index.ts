export type User = {
  email?: string;
  uid?: string;
  picture?: string;
};

export type RoomMemberRole = 'member' | 'owner' | 'moderator';

export type RoomMemberSession = {
  id: string;
  startDate: number;
  endDate?: number;
  sessionOwner: string;
  ip: string;
  mediaChannel: {
    transportId: string;
    producers?: {
      video?: string;
      audio?: string;
    };
  };
  dataChannel?: {
    transportId: string;
    producerId?: string;
  };
  consumers?: Record<
    string,
    {
      targetSession: string;
      channels: {
        transportId: string;
        type: 'audio' | 'video' | 'data';
        consumerId: string;
      }[];
    }
  >;
};

export type RoomMember = {
  uid: string;
  role: RoomMemberRole;
};

export type Room = {
  name: string;
  id: string;
  acceptedMembers: RoomMember[];
  bannedMembers: string[];
  sessions: Record<string, RoomMemberSession>;
};
