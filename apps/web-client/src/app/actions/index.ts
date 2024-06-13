import { ILoginRequest } from "@chattr/interfaces";

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

export class SignOut {
  static type = '[User] Sign out';
}

export class SessionUpdated {
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
