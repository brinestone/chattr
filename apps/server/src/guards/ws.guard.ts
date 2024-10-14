import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Socket } from "socket.io";
import { Principal } from "@chattr/domain";

@Injectable()
export class WsGuard implements CanActivate {
    private readonly logger = new Logger(WsGuard.name);
    constructor(private jwtService: JwtService) { }

    async canActivate(context: ExecutionContext) {
        const token = context.switchToWs().getClient<Socket>().handshake.auth['authorization'] as string;
        const request = context.switchToWs().getClient<Socket>().request;
        if (!token) throw new UnauthorizedException();

        try {
            const { sub, email } = await this.jwtService.verifyAsync(token);
            const principal = {
                email, userId: sub
            } as Principal;

            (request as unknown as any).user = principal;
        } catch (err) {
            this.logger.error(err.message);
            throw new UnauthorizedException();
        }

        return true;
    }
}
