import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger(LoggerMiddleware.name);

    use(req: Request, res: Response, next: (error?: any) => void) {
        res.on('finish', () => {
            const msg = `${req.method} HTTP/${req.httpVersion} ${req.url} -> ${res.statusCode}`;
            if (res.statusCode < 400)
                this.logger.verbose(msg);
            else if (res.statusCode < 500)
                this.logger.warn(msg);
            else
                this.logger.error(msg);
        });
        next();
    }

}
