import { IConnectedMember, ICreateRoomInviteRequest, InviteInfo as IInviteInfo, ILoginRequest, ISignupRequest, IUpdateInviteRequest } from "@chattr/interfaces";
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsMongoId, IsNotEmpty, IsOptional, IsString, IsStrongPassword, IsUrl } from 'class-validator';

export class ConnectedMemberDto implements IConnectedMember {
  displayName!: string;
  avatar?: string;
  constructor(data?: Partial<ConnectedMemberDto>) {
    if (data) Object.assign(this, data);
  }
}

export class InviteDto implements IInviteInfo {
  roomId!: string;
  createdAt!: Date;
  id!: string;
  displayName!: string;
  image?: string;
  @Type(() => ConnectedMemberDto)
  connectedMembers: ConnectedMemberDto[] = [];
  @Type(() => ConnectedMemberDto)
  createdBy!: ConnectedMemberDto;
  constructor(data?: Partial<InviteDto>) {
    if (data) Object.assign(this, data);
  }
}

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

export class UserDto implements Pick<UserDto, 'email' | 'name' | 'id' | 'avatar'> {
  email = '';
  avatar?: string | undefined;
  name = '';
  id = '';

  constructor(data?: Partial<UserDto>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}

export class CreateInviteRequest implements ICreateRoomInviteRequest {
  @IsOptional()
  @IsMongoId({ message: 'Invalid User ID' })
  userId?: string;

  @IsNotEmpty()
  @IsMongoId({ message: 'Invalid Room ID' })
  roomId!: string;

  @IsNotEmpty()
  redirect!: string;

  @IsNotEmpty()
  key!: string;
}

export class UpdateInviteRequest implements IUpdateInviteRequest {
  @IsNotEmpty()
  code = '';

  @IsBoolean()
  accept = true;
}
