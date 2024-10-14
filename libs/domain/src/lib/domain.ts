import {
  IEntity,
  IInvite,
  INotification,
  IPresentation,
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
  @Prop({ type: String, required: true, unique: true })
  email = '';
  @Prop()
  avatar?: string;
  @Prop({ type: String, required: true })
  @Exclude()
  passwordHash = '';
  @Prop({ type: String, required: true })
  name = '';
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
  @Prop({ type: Boolean, default: false })
  isBanned = false;

  @Prop({ type: Boolean, default: true })
  pending = true;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Update' })
  @Exclude()
  inviteId?: MongooseSchema.Types.ObjectId;

  @Type(() => String)
  @Prop({
    type: String,
    enum: ['guest', 'owner', 'moderator'],
    default: 'guest',
  })
  role!: RoomMemberRole;

  @Prop({ required: true, ref: User.name, type: MongooseSchema.Types.ObjectId, _id: false })
  @Transform(
    ({ value }) => {
      return (value as HydratedDocument<User>)._id.toString();
    },
    { toPlainOnly: true }
  )
  userId?: string;

  @Prop({
    ref: 'Room',
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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'RoomSession', _id: false })
  @Exclude()
  activeSession?: string;

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
  members: string[] = [];

  @Prop({ type: String, required: true })
  name = '';

  @Prop()
  image?: string;

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
  @Exclude()
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Room.name, required: true })
  roomId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  serverIp?: string;

  @Prop()
  clientIp?: string;

  @Prop()
  endDate?: Date;

  @Prop({ type: Boolean, default: true })
  connected = true;

  @Prop({ _id: false, type: MongooseSchema.Types.ObjectId, ref: RoomMembership.name })
  @Transform(
    ({ value }) => {
      return (value as MongooseSchema.Types.ObjectId).toString();
    },
    { toPlainOnly: true }
  )
  member?: string;

  @Prop({ type: [String], default: [] })
  producers: string[] = [];

  @Prop()
  avatar?: string;

  constructor(data?: Partial<IRoomSession>) {
    super();
    if (data) Object.assign(this, data);
  }

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, _id: false, required: true })
  @Transform(({ value }) => (value as MongooseSchema.Types.ObjectId).toString(), { toPlainOnly: true })
  userId?: string;

  @Prop({ type: String, required: true })
  displayName = '';
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
  type = '';

  @Prop({
    type: MongooseSchema.Types.ObjectId, ref: User.name, required: true
  })
  @Exclude()
  _from?: MongooseSchema.Types.ObjectId;

  @Expose({ toPlainOnly: true })
  get from(): string {
    return this._from?.toString() ?? '';
  }

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  @Exclude()
  _to?: MongooseSchema.Types.ObjectId;

  // @Expose()
  // get to(): string {
  //   return this._from?.toString() ?? '';
  // }

  @Exclude()
  seen = false

  @Prop()
  image?: string;

  @Prop({ type: String, required: true })
  title = ''

  @Prop({ type: String, required: true })
  body = '';

  @Prop({ type: MongooseSchema.Types.Map })
  data: Record<string, unknown> = {};

  constructor(data?: Partial<INotification>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

@Schema()
export class Invite extends BaseEntity implements IInvite, IUpdate {
  // @Exclude()
  type = '';

  @Exclude()
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: Room.name })
  room?: MongooseSchema.Types.ObjectId;

  @Expose()
  get roomId(): string {
    return this.room?.toString() ?? '';
  }

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: false, type: MongooseSchema.Types.ObjectId, ref: User.name })
  @Exclude()
  to!: string;

  @Exclude()
  seen!: boolean;

  @Prop({ default: false })
  @Exclude()
  accepted!: boolean;

  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  code!: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: User.name, _id: false })
  @Exclude()
  acceptors!: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: RoomMembership.name, _id: false, required: true })
  @Exclude()
  createdBy!: string;

  data!: Record<string, unknown>;

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
  type!: string;

  @Prop({ default: false })
  seen!: boolean;

  @Prop({ default: {}, type: MongooseSchema.Types.Map })
  data?: Record<string, unknown>;
}

export const UpdateSchema = SchemaFactory.createForClass(Update).pre('save', function (next) {
  this.increment();
  return next();
});

@Schema({ timestamps: true })
export class Presentation extends BaseEntity implements IPresentation {
  @Prop({ required: true })
  displayName!: string;

  @Transform(({ value }) => {
    return (value as MongooseSchema.Types.ObjectId).toString();
  }, { toPlainOnly: true })
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: RoomMembership.name })
  owner?: string;

  @Transform(({ value }) => {
    return (value as MongooseSchema.Types.ObjectId).toString();
  }, { toPlainOnly: true })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: RoomSession.name, required: true })
  parentSession!: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: Room.name })
  @Exclude()
  room!: MongooseSchema.Types.ObjectId;

  @Prop({})
  endedAt?: Date;

  constructor(data?: Partial<Presentation>) {
    super();
    if (data) Object.assign(this, data);
  }
}

export const PresentationSchema = SchemaFactory.createForClass(Presentation)
  .pre('save', function (next) {
    if (!this.isNew)
      this.increment();
    return next();
  });
