import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch(WsException)
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);
  catch(exception: HttpException, host: ArgumentsHost) {
    const socket = host.switchToWs().getClient<Socket>();
    this.logger.error(exception.message, exception.stack);
    socket.emit('errors', { errorMessage: exception.message });
  }
}
