import { ILoginRequest } from '@chattr/interfaces';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare } from 'bcrypt';
import { Model } from 'mongoose';
import { UserEntity, UserSession } from '../models';
import { generateRandomToken } from '../util';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(UserEntity.name) private userModel: Model<UserEntity>,
    @InjectModel(UserSession.name) private sessionModel: Model<UserSession>
  ) {
  }
  

  async loginUser({ email, password }: ILoginRequest) {
    const userDoc = await this.userModel.findOne({
      email
    });

    const authError = new Error('Invalid email or password');

    if (!userDoc) throw authError;

    const passwordVerified = await compare(password, userDoc.passwordHash);

    if (!passwordVerified) throw authError;

    const token = generateRandomToken();
    const session = await new this.sessionModel({
      token,
      userId: userDoc
    }).save();

    return session;
  }
}
