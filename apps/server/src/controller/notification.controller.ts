import { Body, ClassSerializerInterceptor, Controller, Get, ParseBoolPipe, ParseIntPipe, Put, Query, Sse, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtGuard } from "../guards/jwt.guard";
import { NotificationService } from "../services/notifications.service";
import { Ctx } from "../decorators/room.decorator";
import { Principal } from "../models";

@Controller('notifications')
@UseGuards(JwtGuard)
export class NotificationController {
    constructor(
        private notificationService: NotificationService
    ) { }

    @Put('seen')
    async markAsSeen(@Body() { ids }: { ids: string[] }) {
        return await this.notificationService.markAsSeen(...ids);
    }

    @Get()
    @UseInterceptors(ClassSerializerInterceptor)
    async getNotifications(
        @Ctx('user') { userId }: Principal,
        @Query('seenOnly', new ParseBoolPipe({ optional: true })) onlySeen = true,
        @Query('size', new ParseIntPipe({ optional: true })) size = 100,
        @Query('offset') offset?: string
    ) {
        return await this.notificationService.findNotifications(userId, size, onlySeen, offset);
    }

    @Sse('live')
    liveNotifications(
        @Ctx('user') { userId }: Principal,
    ) {
        return this.notificationService.getLiveNotifications(userId)
    }
}
