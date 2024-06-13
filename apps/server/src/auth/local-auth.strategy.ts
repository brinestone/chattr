import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../services/auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private authService: AuthService) {
        super({ usernameField: 'email' });
    }

    async validate(username: string, password: string) {
        try {
            const user = await this.authService.validateCredentials(username, password);
            return user;
        } catch (err) {
            logger.error(err.message, err.stack);
            throw new UnauthorizedException(err.message);
        }
    }
}

const logger = new Logger(LocalStrategy.name);
