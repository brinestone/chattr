import { ISignupRequest } from '@chattr/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { genSalt, hash } from 'bcrypt';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../models';
import { UserDto } from '@chattr/dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    // @InjectModel(UserSession.name) private sessionModel: Model<UserSession>
  ) {
  }

  async searchUsersAsync(query: string, limit: number) {
    const docs = await this.userModel.find({ $text: { $search: query, $caseSensitive: false } })
      .sort({ name: 'asc' })
      .limit(limit);

    if (docs.length == 0) return [];

    return docs.map(doc => plainToInstance(UserDto, doc.toObject()))
  }

  async findByIdInternalAsync(id: string) {
    return this.userModel.findById(id).exec();
  }

  async updateUserInternalAsync(id: string, update: UpdateQuery<User>) {
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
