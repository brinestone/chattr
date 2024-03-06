import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";

@Catch(WsException)
export class WsExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const socket = host.switchToWs().getClient<Socket>();
        socket.emit('errors', JSON.stringify({ errorMessage: exception.message }));
    }
}