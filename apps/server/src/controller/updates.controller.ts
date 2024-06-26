import { Body, ClassSerializerInterceptor, Controller, Get, ParseBoolPipe, ParseIntPipe, Put, Query, Sse, UseGuards, UseInterceptors, ValidationPipe } from "@nestjs/common";
import { JwtGuard } from "../guards/jwt.guard";
import { UpdatesService } from "../services/updates.service";
import { Ctx } from "../decorators/extract-from-context.decorator";
import { Principal } from "../models";
import { UpdateInviteRequest } from "@chattr/dto";

@Controller('invites')
@UseGuards(JwtGuard)
export class InvitesController {
    constructor(private updateService: UpdatesService) { }

    @Put()
    async updateInvite(
        @Body(new ValidationPipe({ transform: true })) request: UpdateInviteRequest,
        @Ctx('user') { userId }: Principal
    ) {
        return await this.updateService.updateInvite(request, userId);
    }
}

@Controller('updates')
@UseGuards(JwtGuard)
export class UpdatesController {
    constructor(
        private updatesService: UpdatesService
    ) { }

    @Put('seen')
    async markAsSeen(@Body() { ids }: { ids: string[] }) {
        return await this.updatesService.markAsSeen(...ids);
    }

    @Get()
    @UseInterceptors(ClassSerializerInterceptor)
    async getNotifications(
        @Ctx('user') { userId }: Principal,
        @Query('unseenOnly', new ParseBoolPipe({ optional: true })) unseenOnly = true,
        @Query('size', new ParseIntPipe({ optional: true })) size = 100,
        @Query('offset') offset?: string
    ) {
        return await this.updatesService.findNotifications(userId, size, unseenOnly, offset);
    }

    @Sse('live')
    liveNotifications(
        @Ctx('user') { userId }: Principal,
    ) {
        return this.updatesService.getLiveNotifications(userId)
    }
}
