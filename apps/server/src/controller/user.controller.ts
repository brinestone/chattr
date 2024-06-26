import { ClassSerializerInterceptor, Controller, Get, ParseIntPipe, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtGuard } from '../guards/jwt.guard';
import { UserService } from '../services/user.service';

@Controller('users')
@UseGuards(JwtGuard)
export class UserController {
  constructor(private userService: UserService) { }

  @Get('search')
  @UseInterceptors(ClassSerializerInterceptor)
  async findUsers(
    @Query('q') query: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: 20
  ) {
    return this.userService.searchUsersAsync(query, limit);
  }
}
