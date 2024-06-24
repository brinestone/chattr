import { ConnectionStatus, ILoginRequest, ISignupRequest } from "@chattr/interfaces";
import { MediaKind, RtpCapabilities, RtpParameters } from "mediasoup-client/lib/RtpParameters";
import { DtlsParameters } from "mediasoup-client/lib/Transport";

export class SetAudioDevice {
  static type = '[Device] Set Audio device';
  constructor(readonly id?: string) { }
}

export class SetVideoDevice {
  static type = '[Device] Set Video Device';
  constructor(readonly id?: string) { }
}

export class SaveDeviceConfig {
  static type = '[Device] Save Device Config';
}

export class SignIn implements ILoginRequest {
  static type = '[User] Sign in';
  constructor(readonly email: string, readonly password: string) { }
}

export class SignUp implements ISignupRequest {
  static type = '[User] Sign up';
  constructor(readonly email: string, readonly name: string, readonly password: string) { }
}

export class SignOut {
  static type = '[User] Sign out';
}

export class UserSessionUpdated {
  static type = '[User] Session updated';
  constructor(readonly signedIn: boolean) { }
}

export class CreateRoom {
  static type = `[Room] Create room`;
  constructor(readonly name: string) { }
}

export class LoadRooms {
  static type = '[Room] Load rooms'
}

export class ConnectToRoom {
  static type = `[Room] Set Connected Room`;
  constructor(readonly id: string) { }
}

export class ConnectedRoomChanged {
  static type = `[Room] Connected Room Changed`;
}

export class ClearConnectedRoom {
  static type = `[Room] Clear Connected`;
}

export class JoinSession {
  static type = '[Room] Join Session';
  constructor(readonly id: string) { }
}

export class LeaveSession {
  static type = '[Room] Leave Session';
  constructor(readonly id: string) { }
}

export class SessionJoined {
  static type = '[Room] Session Joined';
  constructor(readonly transportParams: unknown, readonly rtpCapabilities: RtpCapabilities, readonly sessionId: string) { }
}

export class ConnectTransport {
  static type = '[Room] Connect Transport';
  constructor(readonly sessionId: string, readonly dtlsParameters: DtlsParameters) { }
}

export class TransportConnected {
  static type = '[Room] Transport Connected';
  constructor(readonly sessionId: string) { }
}

export class CreateServerSideProducer {
  static type = `[Room] Create Server-side Producer`;
  constructor(readonly sessionId: string, readonly kind: MediaKind, readonly rtpParameters: RtpParameters) { }
}

export class ServerSideProducerCreated {
  static type = `[Room] Server-side Producer Created`;
  constructor(readonly producerId: string, readonly sessionId: string, readonly kind: MediaKind) { }
}

export class UpdateConnectionStatus {
  static type = `[Room] Update Connection Status`;
  constructor(readonly status: ConnectionStatus, readonly reason?: string) { }
}

export class ServerError {
  static type = `[Room] Server Error`;
  constructor(readonly message: string) { }
}

export class CreateServerSideConsumer {
  static type = `[Room] Create Server-side Consumer`;
  constructor(readonly producerId: string, readonly sessionId: string, readonly rtpCapabilities: RtpCapabilities) { }
}

export class ServerSideConsumerCreated {
  static type = `[Room] Server-side Consumer created`;
  constructor(readonly id: string, readonly kind: MediaKind, readonly sessionId: string, readonly producerId: string, readonly rtpParameters: RtpParameters) { }
}

export class ToggleConsumerStream {
  static type = `[Room] Toggle Consumer Stream`;
  constructor(readonly consumerId: string) { }
}

export class NewSessionProducer {
  static type = `[Room] Session Updated - New Session Producer`;
  constructor(readonly sessionId: string, readonly producerId: string) {}
}
