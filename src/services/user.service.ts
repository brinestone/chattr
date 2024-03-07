import { Inject, Injectable } from '@nestjs/common';
import { App } from 'firebase-admin/app';

@Injectable()
export class UserService {
  constructor(@Inject('FIREBASE') private app: App) {}
}
