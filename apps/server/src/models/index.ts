import {
  IEntity,
  IInvite,
  INotification,
  IRoom,
  IRoomMembership,
  IRoomSession,
  IUpdate,
  IUser,
  RoomMemberRole,
} from '@chattr/interfaces';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type UserDocument = HydratedDocument<IUser>;
export type RoomMembershipDocument = HydratedDocument<IRoomMembership>;
export type RoomDocument = HydratedDocument<IRoom>;
export type NotificationDocument = HydratedDocument<Notification>;

abstract class BaseEntity implements IEntity {
  @Exclude()
  _id!: MongooseSchema.Types.ObjectId;
  @Exclude()
  __v!: number;
  updatedAt!: Date;
  createdAt!: Date;
  @Expose()
  get id() {
    return this._id.toString();
  }
}

@Schema({ timestamps: true })
export class User extends BaseEntity implements IUser {
  @Prop({ required: true, unique: true })
  email: string;
  @Prop()
  avatar?: string;
  @Prop({ required: true })
  @Exclude()
  passwordHash: string;
  @Prop({ required: true })
  name: string;
  @Prop()
  @Exclude()
  notificationResumeToken?: string;

  constructor(data?: Partial<IUser>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const UserSchema = SchemaFactory.createForClass(User)
  .index({ name: 'text', email: 'text' }).pre(
    'save',
    function (next) {
      this.increment();
      return next();
    }
  );

@Schema({ timestamps: true })
export class RoomMembership extends BaseEntity implements IRoomMembership {
  @Prop({ default: false })
  isBanned: boolean;

  @Prop({ default: true })
  pending: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Update' })
  @Exclude()
  inviteId?: MongooseSchema.Types.ObjectId;

  @Type(() => String)
  @Prop({
    type: String,
    enum: ['member', 'owner', 'moderator'],
    default: 'member',
  })
  role: RoomMemberRole;

  @Prop({ required: true, ref: User.name, type: MongooseSchema.Types.ObjectId, _id: false })
  @Transform(
    ({ value }) => {
      return (value as HydratedDocument<User>)._id.toString();
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

  constructor(data?: Partial<IRoomMembership>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const RoomMemberSchema = SchemaFactory.createForClass(
  RoomMembership
).pre('save', function (next) {
  this.increment();
  return next();
});

@Schema({ timestamps: true })
export class Room extends BaseEntity implements IRoom {
  @Prop({
    ref: RoomMembership.name,
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

  constructor(data?: Partial<IRoom>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const RoomSchema = SchemaFactory.createForClass(Room).pre(
  'save',
  function (next) {
    this.increment();
    return next();
  }
);

@Schema({ timestamps: true })
export class RoomSession extends BaseEntity implements IRoomSession {
  @Prop({ required: true })
  serverIp: string;

  @Prop()
  clientIp: string;

  @Prop()
  endDate?: Date;

  @Prop({ default: true })
  connected: boolean;

  @Prop({ _id: false, type: MongooseSchema.Types.ObjectId, ref: RoomMembership.name })
  @Transform(
    ({ value }) => {
      return (value as MongooseSchema.Types.ObjectId).toString();
    },
    { toPlainOnly: true }
  )
  member?: string;

  @Prop({ type: [String], default: [] })
  producers: string[];

  @Prop()
  avatar?: string;

  constructor(data?: Partial<IRoomSession>) {
    super();
    if (data) Object.assign(this, data);
  }

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, _id: false, required: true })
  @Transform(({ value }) => (value as MongooseSchema.Types.ObjectId).toString(), { toPlainOnly: true })
  userId?: string;

  @Prop({ required: true })
  displayName: string;
}

export const RoomSessionSchema = SchemaFactory.createForClass(
  RoomSession
).pre('save', function (next) {
  this.increment();
  return next();
});

// @Schema({ timestamps: true })
// export class UserSession extends BaseEntity {
//   @Prop({ required: true, unique: true })
//   token: string;
//   @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: User.name })
//   user: UserDocument;
// }

// export const SessionSchema = SchemaFactory.createForClass(UserSession).pre('save', function (next) {
//   this.increment();
//   return next();
// });

export type Principal = {
  email: string;
  userId: string;
  displayName: string;
}

@Schema()
export class Notification extends BaseEntity implements INotification, IUpdate {
  type: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId, ref: User.name, required: true
  })
  @Transform(({ value }) => (value as MongooseSchema.Types.ObjectId).toString(), { toPlainOnly: true })
  from: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  @Exclude()
  to: string;

  @Exclude()
  seen: boolean;

  @Prop()
  image?: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;
  data: Record<string, unknown>;

  constructor(data?: Partial<INotification>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

@Schema()
export class Invite extends BaseEntity implements IInvite, IUpdate {
  // @Exclude()
  type: string;

  @Transform(({ value }) => {
    return (value as MongooseSchema.Types.ObjectId).toString();
  }, { toPlainOnly: true })
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: Room.name })
  roomId: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: false, type: MongooseSchema.Types.ObjectId, ref: User.name })
  @Exclude()
  to: string;

  @Exclude()
  seen: boolean;

  @Prop({ default: false })
  @Exclude()
  accepted: boolean;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  code: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: User.name, _id: false })
  @Exclude()
  acceptors: string[];

  data: Record<string, unknown>;

  constructor(data?: Partial<Invite>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const InviteSchema = SchemaFactory.createForClass(Invite);

@Schema({ discriminatorKey: 'type', timestamps: true })
export class Update extends BaseEntity implements IUpdate {
  @Prop({
    type: String,
    required: true,
    enum: [Notification.name, Invite.name]
  })
  type: string;

  @Prop({ default: false })
  seen: boolean;

  @Prop({ default: {}, type: MongooseSchema.Types.Map })
  data?: any;
}

export const UpdateSchema = SchemaFactory.createForClass(Update).pre('save', function (next) {
  this.increment();
  return next();
})
