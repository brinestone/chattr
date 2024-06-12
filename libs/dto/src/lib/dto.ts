import { ILoginRequest } from "@chattr/interfaces";
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginRequest implements ILoginRequest {
  @IsNotEmpty()
  @IsEmail()
  @IsString()
  email = '';

  @IsNotEmpty()
  @IsEmail()
  @IsString()
  password = '';

}
