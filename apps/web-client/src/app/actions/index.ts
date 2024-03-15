export class SetAudioDevice {
  static type = '[Device] Set Audio device';
  constructor(readonly id?: string) {}
}

export class SetVideoDevice {
  static type = '[Device] Set Video Device';
  constructor(readonly id?: string) {}
}
