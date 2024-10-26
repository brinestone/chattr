import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response } from 'express';
import moment, { duration } from 'moment';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger(LoggerMiddleware.name);

    use(req: Request, res: Response, next: (error?: Error) => void) {
        const start= moment();
        res.on('finish', () => { 
            const end = moment();
            const timeTaken = duration(end.diff(start)).asMilliseconds()
            const msg = `${req.method.slice(0,4)}\t|${res.statusCode}\t|${timeTaken}ms\t|${req.url}`;
            if (res.statusCode < 400)
                this.logger.log(msg);
            else if (res.statusCode < 500)
                this.logger.warn(msg);
            else
                this.logger.error(msg);
        });
        next();
    }

}
