import { ICreateRoomInviteRequest, IUpdateInviteRequest } from "@chattr/interfaces";
import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { instanceToPlain } from "class-transformer";
import { isMongoId } from "class-validator";
import EventEmitter from "events";
import { FilterQuery, HydratedDocument, Model, Types, UpdateQuery } from "mongoose";
import { filter, fromEvent, map } from "rxjs";
import { Events } from "../events";
import { Invite, Notification, Update } from '../models';
import { generateRandomToken } from "../util";

type MessageEvent<T = Notification> = {
    event: string,
    data: T;
}

export type ICreateNotificationRequest = {
    to: string | Types.ObjectId;
    body: string;
    sender: string | Types.ObjectId;
    image?: string;
    title: string;
    data?: Record<string, unknown>;
}

export type InvitationEventData = { roomId: string, userId: string, inviteId: string, targeted: boolean };

@Injectable()
export class UpdatesService {
    private readonly logger = new Logger(UpdatesService.name);
    private readonly notificationModel: Model<Notification>;
    private readonly inviteModel: Model<Invite>;
    readonly observer = new EventEmitter();
    constructor(
        // @InjectModel(RoomMembership.name) private membershipModel: Model<RoomMembership>,
        // @InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(Update.name) private updatesModel: Model<Notification>) {
        this.notificationModel = updatesModel.discriminators[Notification.name];
        this.inviteModel = updatesModel.discriminators[Invite.name];
    }

    async getInvitationInfo(code: string) {
        const now = new Date();
        const invite = await this.inviteModel.findOne({
            code
        })
        .exec();

        if(!invite) throw new NotFoundException('Invitation not found');
        const diff = now.valueOf() - invite.expiresAt.valueOf();
        if(diff > 0) throw new ForbiddenException('Invitation expired');

        await invite.populate(['createdBy', 'roomId.members']);
        

    }

    async updateInvite({ accept: accepted, code }: IUpdateInviteRequest, actor: string) {
        const now = new Date();
        const inviteDoc = await this.inviteModel.findOne({
            code,
            expiresAt: { $gt: now },
            $or: [
                { to: null },
                { to: actor, accepted: { $ne: true } }
            ]
        });

        if (!inviteDoc) throw new NotFoundException('Invite not found');
        const update: UpdateQuery<HydratedDocument<Invite>> = {
            $set: {},
            $inc: {
                __v: 1
            }
        };

        if (inviteDoc.to) {
            update.$set.accepted = accepted;
            update.$set.expiresAt = now;
        }
        if (accepted) {
            update.$push = {
                acceptors: actor
            }
        }

        await inviteDoc.updateOne(update).exec();

        if (accepted) {
            this.observer.emit(Events.InvitationAccepted, { inviteId: inviteDoc._id.toString(), userId: actor, roomId: inviteDoc.roomId, targeted: !!inviteDoc.to });
        } else {
            this.observer.emit(Events.InvitationDenied, { inviteId: inviteDoc._id.toString(), userId: actor, roomId: inviteDoc.roomId, targeted: !!inviteDoc.to });
        }
    }

    async createInvite({ roomId, userId: inviteeId, redirect, key }: ICreateRoomInviteRequest, createdBy: string): Promise<[string, string]> {
        const expiresAt = new Date(Date.now() + 3 * 3_600_000);
        const url = new URL(redirect);
        const code = generateRandomToken(3).toUpperCase();
        url.searchParams.set(key, code);
        const doc = await new this.inviteModel({
            roomId, to: inviteeId, expiresAt, url: url.toString(), code, createdBy
        }).save();

        return [url.toString(), doc._id.toString()];
    }

    async createNotification({ body, title, to, sender, data, image }: ICreateNotificationRequest) {
        const doc = await new this.notificationModel({
            body, title, to, data, from: sender, image
        }).save();
        const notification = new Notification(doc.toObject());
        this.observer.emit(Events.NotificationSent, notification);
    }

    async markAsSeen(...ids: string[]) {
        const result = await this.updatesModel.updateMany(
            {
                _id: { $in: ids.map(id => new Types.ObjectId(id)) }
            }, {
            $set: { seen: true },
            $inc: { __v: 1 }
        });

        this.logger.verbose(`Marked ${result.modifiedCount} notifications as seen`);
    }

    async findNotifications(userId: string, size: number, unseenOnly: boolean, after?: string) {
        const query: FilterQuery<Notification> = {
            to: userId,
        };
        if (after && isMongoId(after))
            query._id = { $gt: after }

        if (unseenOnly) {
            query.seen = { $ne: true };
        }
        const docs = await this.notificationModel.find(query).limit(size).exec();
        return docs.map(doc => new Notification(doc.toObject()));
    }


    getLiveNotifications(userId: string) {
        return fromEvent(this.observer, Events.NotificationSent).pipe(
            filter(({ to }: Notification) => to.toString() == userId),
            map(data => ({ data: instanceToPlain(data), event: 'Notification' } as MessageEvent))
        );
    }
}
