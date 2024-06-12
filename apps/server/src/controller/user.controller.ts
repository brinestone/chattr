import { LoginRequest, SignUpRequest } from '@chattr/dto';
import { Body, Controller, Post, Session, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AppSession } from '../models';
import { UserService } from '../services/user.service';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) { }

  @Post('signup')
  async onSignUp(@Body(new ValidationPipe({ transform: true })) request: SignUpRequest) {
    return this.userService.signupUser(request);
  }

  @Post('login')
  async onLogin(@Session() session: AppSession, @Body(new ValidationPipe({ transform: true })) request: LoginRequest) {
    try {
      const userId = await this.userService.loginUser(request);
      session.userId = userId;

    } catch (err) {
      if (err instanceof Error) {
        throw new UnauthorizedException(err.message);
      }
    }
  }
}
