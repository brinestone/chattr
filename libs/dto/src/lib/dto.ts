import { ILoginRequest, ISignupRequest } from "@chattr/interfaces";
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsStrongPassword, IsUrl } from 'class-validator';

export class LoginRequest implements ILoginRequest {
  @IsNotEmpty()
  @IsEmail()
  @IsString()
  email = '';

  @IsNotEmpty()
  @IsString()
  password = '';
}

export class SignUpRequest implements ISignupRequest {
  @IsOptional()
  @IsUrl()
  avatar?: string | undefined;

  @IsNotEmpty()
  @IsEmail()
  email = '';

  @IsNotEmpty()
  @IsString()
  name = '';

  @IsStrongPassword({ minLength: 6 })
  password = '';
}
