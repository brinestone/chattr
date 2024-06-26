export interface Entity {
  id: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface User extends Entity {
  email: string;
  avatar?: string;
  name: string;
}

export interface INotification extends Entity {
  from: string;
  image?: string;
  title: string;
  body: string;
}

export type RoomMemberRole = 'guest' | 'owner' | 'moderator';

export interface RoomMemberSession extends Entity {
  serverIp: string;
  clientIp: string;
  endDate?: Date;
  member?: string;
  userId?: string;
  producers: string[];
  connected: boolean;
  displayName: string;
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

export interface ISignupRequest {
  name: string;
  avatar?: string;
  email: string;
  password: string;
}

export interface ILoginResponse {
  access_token: string;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'idle';

export type ConnectedRoom = {
  info: Room;
  session: RoomMemberSession;
  otherSessions: RoomMemberSession[];
  connectionStatus: ConnectionStatus;
}

export enum Signaling {
  JoinSession = 'JOIN_SESSION',
  LeaveSession = 'LEAVE_SESSION',
  SessionClosed = 'SESSION_CLOSED',
  ConnectTransport = 'CONNECT_TRANSPORT',
  SessionOpened = 'SESSION_OPENED',
  CreateConsumer = 'CREATE_CONSUMER',
  CreateProducer = 'CREATE_PRODUCER',
  ProducerOpened = 'PRODUCER_OPENED',
  ProducerClosed = 'PRODUCER_CLOSED',
  CloseProducer = 'CLOSE_PRODUCER',
  CloseConsumer = 'CLOSE_CONSUMER'
}
