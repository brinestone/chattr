import { ICreateRoomInviteRequest, IUpdateInviteRequest } from "@chattr/interfaces";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isMongoId } from "class-validator";
import EventEmitter from "events";
import { FilterQuery, HydratedDocument, Model, Types, UpdateQuery } from "mongoose";
import { concatMap, filter, from, map, of, switchMap, zip } from "rxjs";
import { Events } from "../events";
import { Invite, Notification, NotificationDocument, Update } from '../models';
import { generateRandomToken } from "../util";
import { UserService } from "./user.service";

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
    constructor(@InjectModel(Update.name) private updatesModel: Model<Notification>, private userService: UserService) {
        this.notificationModel = updatesModel.discriminators[Notification.name];
        this.inviteModel = updatesModel.discriminators[Invite.name];
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

    async createInvite({ roomId, userId: inviteeId, redirect, key }: ICreateRoomInviteRequest): Promise<[string, string]> {
        const expiresAt = new Date(Date.now() + 3 * 3_600_000);
        const url = new URL(redirect);
        const code = generateRandomToken(3).toUpperCase();
        url.searchParams.set(key, code);
        const doc = await new this.inviteModel({
            roomId, to: inviteeId, expiresAt, url: url.toString(), code
        }).save();

        return [url.toString(), doc._id.toString()];
    }

    async createNotification({ body, title, to, sender, data, image }: ICreateNotificationRequest) {
        await new this.notificationModel({
            body, title, to, data, from: sender, image
        }).save();
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
        return from(this.userService.findByIdInternalAsync(userId)).pipe(
            concatMap(userDoc => {
                const resumeToken = userDoc.notificationResumeToken;
                const watchStream = this.notificationModel.watch<NotificationDocument>([], { resumeAfter: resumeToken });
                return zip([
                    userDoc.updateOne({
                        $set: { notificationResumeToken: watchStream.resumeToken }
                    }).exec(),
                    of(watchStream)
                ])
            }),
            switchMap(([_, watchStream]) => {
                return from(watchStream).pipe(
                    map(event => event as { operationType: string, fullDocument: NotificationDocument }),
                    filter(({ operationType, fullDocument: { to } }) => operationType == 'insert' && to.toString() == userId),
                    map(({ fullDocument: data }) => ({
                        event: 'Notification',
                        data: new Notification(data.toObject())
                    } as MessageEvent))
                )
            })
        );
    }
}
