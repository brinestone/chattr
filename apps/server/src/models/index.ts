import {
  Entity,
  Room,
  RoomMember,
  RoomMemberSession,
  User,
  RoomMemberRole,
} from '@chattr/interfaces';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import {} from 'connect-mongo';

export type UserDocument = HydratedDocument<User>;
export type RoomMemberDocument = HydratedDocument<RoomMember>;
export type RoomDocument = HydratedDocument<Room>;

abstract class BaseEntity implements Entity {
  _id!: MongooseSchema.Types.ObjectId;
  _v!: number;
  updatedAt!: Date;
  createdAt!: Date;
  @Expose()
  get id() {
    return this._id.toString();
  }
}

@Schema({ timestamps: true })
export class UserEntity extends BaseEntity implements User {
  @Prop({ required: true, unique: true })
  email: string;
  @Prop()
  avatar?: string;
  @Prop({ required: true })
  @Exclude()
  passwordHash: string;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity).pre(
  'save',
  function (next) {
    this.increment();
    return next();
  }
);

@Schema({ timestamps: true })
export class RoomMemberEntity extends BaseEntity implements RoomMember {
  @Prop({ default: false })
  isBanned: boolean;

  @Type(() => String)
  @Prop({
    type: String,
    enum: ['member', 'owner', 'moderator'],
    default: 'member',
  })
  role: RoomMemberRole;

  @Prop({ ref: UserEntity.name, type: MongooseSchema.Types.ObjectId, _id: false })
  @Transform(
    ({ value }) => {
      return (value as HydratedDocument<UserEntity>)._id.toString();
    },
    { toPlainOnly: true }
  )
  userId?: string;

  @Prop({
    ref: 'RoomEntity',
    type: MongooseSchema.Types.ObjectId,
    required: true,
  })
  @Transform(
    ({ value }) => {
      return (value as MongooseSchema.Types.ObjectId).toString();
    },
    { toPlainOnly: true }
  )
  roomId?: string;

  constructor(data?: Partial<RoomMember>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const RoomMemberSchema = SchemaFactory.createForClass(
  RoomMemberEntity
).pre('save', function (next) {
  this.increment();
  return next();
});

@Schema({ timestamps: true })
export class RoomEntity extends BaseEntity implements Room {
  @Prop({
    ref: RoomMemberEntity.name,
    type: [MongooseSchema.Types.ObjectId],
    _id: false,
    default: [],
  })
  @Transform(
    ({ value }) => {
      return (value as MongooseSchema.Types.ObjectId[]).map((v) =>
        v.toString()
      );
    },
    { toPlainOnly: true }
  )
  members: string[];

  @Prop({ required: true })
  name: string;

  constructor(data?: Partial<Room>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const RoomSchema = SchemaFactory.createForClass(RoomEntity).pre(
  'save',
  function (next) {
    this.increment();
    return next();
  }
);

@Schema({ timestamps: true })
export class RoomSessionEntity extends BaseEntity implements RoomMemberSession {
  @Prop({ required: true })
  serverIp: string;

  @Prop()
  clientIp: string;

  @Prop()
  endDate?: Date;

  @Prop({ _id: false, type: MongooseSchema.Types.ObjectId, ref: RoomMemberEntity.name })
  @Transform(
    ({ value }) => {
      return (value as MongooseSchema.Types.ObjectId).toString();
    },
    { toPlainOnly: true }
  )
  member?: string;

  @Prop({ type: [String], default: [] })
  producers: string[];

  constructor(data?: Partial<RoomMemberSession>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const RoomSessionSchema = SchemaFactory.createForClass(
  RoomSessionEntity
).pre('save', function (next) {
  this.increment();
  return next();
});

@Schema({ timestamps: true })
export class UserSession extends BaseEntity implements ISession{
  @Prop({ required: true, unique: true })
  token: string;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: UserEntity.name })
  user: UserDocument;
}

export const SessionSchema = SchemaFactory.createForClass(UserSession).pre('save', function (next) {
  this.increment();
  return next();
})
