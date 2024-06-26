import { SignUpRequest } from "@chattr/dto";
import { Body, Controller, Post, Request, UseGuards, ValidationPipe } from "@nestjs/common";
import { Request as ExpressRequest } from 'express';
import { LocalAuthGuard } from "../guards/local.guard";
import { AuthService } from "../services/auth.service";
import { User } from "../models";

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('signup')
    async onSignUp(@Body(new ValidationPipe({ transform: true })) request: SignUpRequest) {
        return this.authService.signUpUser(request);
    }

    @Post('login')
    @UseGuards(LocalAuthGuard)
    async onLogin(@Request() req: ExpressRequest) {
        return this.authService.loginUser(req.user as unknown as User);
    }
}
