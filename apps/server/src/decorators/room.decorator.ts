import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Request } from "express";
import { Socket } from "socket.io";

export const Ctx = (key: string) => createParamDecorator((_: unknown, ctx: ExecutionContext) => {
    const value = (ctx.getType() == 'ws' ? ctx.switchToWs().getClient<Socket>().request : ctx.switchToHttp().getRequest<Request>())[key];
    return value;
})();