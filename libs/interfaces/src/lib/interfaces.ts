export interface IEntity {
  id: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface IUser extends IEntity {
  email: string;
  avatar?: string;
  name: string;
}

export interface INotification extends IEntity {
  from: string;
  image?: string;
  title: string;
  body: string;
}

export type RoomMemberRole = 'guest' | 'owner' | 'moderator';

export interface IRoomSession extends IEntity {
  serverIp: string;
  clientIp: string;
  endDate?: Date;
  member?: string;
  userId?: string;
  producers: string[];
  connected: boolean;
  avatar?: string;
  displayName: string;
}

export interface IInvite extends IEntity {
  createdBy: string;
  roomId: string;
  expiresAt: Date;
  url: string;
}

export interface IConnectedMember {
  displayName: string;
  avatar?: string;
}
export interface InviteInfo extends Pick<IInvite, 'roomId' | 'createdAt' | 'id'> {
  image?: string;
  displayName: string;
  connectedMembers: IConnectedMember[];
  createdBy: IConnectedMember;
}

export interface IRoomMembership extends IEntity {
  isBanned: boolean;
  pending: boolean;
  roomId?: string;
  userId?: string;
  role: string;
}

export interface IRoom extends IEntity {
  name: string;
  members: string[];
  image?: string;
}

export interface IPresentation extends IEntity {
  displayName: string;
  parentSession: string;
  endedAt?: Date;
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

export interface ICreateRoomInviteRequest {
  userId?: string;
  roomId: string;
  redirect: string;
  key: string;
}

export interface IUpdateInviteRequest {
  code: string;
  accept: boolean;
}

export type IUpdate<T = unknown> = {
  type: string;
  data?: T;
}

export interface ILoginResponse {
  access_token: string;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'idle';


export enum Signaling {
  JoinSession = 'JOIN_SESSION',
  LeaveSession = 'LEAVE_SESSION',
  SessionClosed = 'SESSION_CLOSED',
  ConnectSessionTransport = 'CONNECT_SESSION_TRANSPORT',
  SessionOpened = 'SESSION_OPENED',
  CreateSessionConsumer = 'CREATE_SESSION_CONSUMER',
  CreateSessionProducer = 'CREATE_SESSION_PRODUCER',
  ProducerOpened = 'PRODUCER_OPENED',
  ProducerClosed = 'PRODUCER_CLOSED',
  CloseProducer = 'CLOSE_PRODUCER',
  CloseConsumer = 'CLOSE_CONSUMER',
  AdmissionPending = 'ADMISSION_PENDING',
  AdmissionApproved = 'ADMISSION_APPROVED',
  ApproveAdmission = 'APPROVE_ADMISSION',
  ToggleConsumer = 'TOGGLE_CONSUMER',
  StatsSubscribe = 'STATS_SUBSCRIBE',
  StatsUpdate = 'STATS_UPDATE',
  StatsEnd = 'STATS_END',
  SpeakingSessionChanged = 'SPEAKING_SESSION_CHANGED',
  SessionUpdated = 'SESSION_UPDATED',
  RoomUpdated = 'ROOM_UPDATED',
  PresentationUpdated = 'PRESENTATION_UPDATED',
  JoinPresentation = 'JOIN_PRESENTATION',
  ConnectPresentationTransport = 'CONNECT_PRESENTATION_TRANSPORT',
  CreatePresentationProducer = 'CREATE_PRESENTATION_PRODUER',
  PresentationStarted = 'PRESENTATION_STARTED',
  CreatePresentationConsumer = 'CREATE_PRESENTATION_CONSUMER'
}
