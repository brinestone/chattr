import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model, Types } from "mongoose";
import { Notification, NotificationDocument } from '../models';
import { Observable, concatMap, filter, from, map, of, switchMap, zip } from "rxjs";
import { UserService } from "./user.service";
import { isMongoId } from "class-validator";

type MessageEvent<T = Notification> = {
    event: string,
    data: T;
}

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    constructor(@InjectModel(Notification.name) private notificationModel: Model<Notification>, private userService: UserService) { }

    async markAsSeen(...ids: string[]) {
        const result = await this.notificationModel.updateMany(
            {
                _id: { $in: ids.map(id => new Types.ObjectId(id)) }
            }, {
            $set: { seen: true },
            $inc: { __v: 1 }
        });

        this.logger.verbose(`Marked ${result.modifiedCount} notifications as seen`);
    }

    async findNotifications(userId: string, size: number, seenOnly: boolean, after?: string) {
        const query: FilterQuery<Notification> = {
            to: userId,
        };
        if (after && isMongoId(after))
            query._id = { $gt: after }

        if (seenOnly) {
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
