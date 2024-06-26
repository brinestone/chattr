import { ISignupRequest } from '@chattr/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { genSalt, hash } from 'bcrypt';
import { Model, UpdateQuery } from 'mongoose';
import { UserEntity } from '../models';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(UserEntity.name) private userModel: Model<UserEntity>,
    // @InjectModel(UserSession.name) private sessionModel: Model<UserSession>
  ) {
  }

  async findByIdInternalAsync(id: string) {
    return this.userModel.findById(id).exec();
  }

  async updateUserInternalAsync(id: string, update: UpdateQuery<UserEntity>) {
    return this.userModel.findByIdAndUpdate(id, update);
  }

  async createUserAsync({ email, name, password, avatar }: ISignupRequest) {
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

  async findUserByEmailAsync(email: string) {
    return await this.userModel.findOne({ email }).exec();
  }
}
