import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { UserService } from '../services/user.service';
import { LoginRequest } from '@chattr/dto';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) { }

  @Post('login')
  async onLogin(@Body(new ValidationPipe({ transform: true })) request: LoginRequest) {
    const session = await this.userService.loginUser(request);
    
  }
}
