import { ILoginRequest, ISignupRequest } from '@chattr/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, genSalt, hash } from 'bcrypt';
import { Model } from 'mongoose';
import { UserEntity } from '../models';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(UserEntity.name) private userModel: Model<UserEntity>,
    // @InjectModel(UserSession.name) private sessionModel: Model<UserSession>
  ) {
  }

  async signupUser({ email, name, password, avatar }: ISignupRequest) {
    const exists = await this.userModel.exists({
      email
    }).exec();

    if (exists) throw new ConflictException('Email address is already in use');

    const salt = await genSalt(12);
    const passwordHash = await hash(password, salt);

    await new this.userModel({
      email,
      passwordHash,
      avatar,
      name
    }).save();
  }

  async loginUser({ email, password }: ILoginRequest) {
    const userDoc = await this.userModel.findOne({
      email
    });

    const authError = new Error('Invalid email or password');

    if (!userDoc) throw authError;

    const passwordVerified = await compare(password, userDoc.passwordHash);

    if (!passwordVerified) throw authError;

    return userDoc._id.toString();
  }
}
