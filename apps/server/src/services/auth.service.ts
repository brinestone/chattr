import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcrypt";
import { UserEntity } from "../models";
import { UserService } from "./user.service";
import { ISignupRequest } from "@chattr/interfaces";

@Injectable()
export class AuthService {
    constructor(private userService: UserService, private jwtService: JwtService) { }

    async signUpUser(request: ISignupRequest) {
        return this.userService.createUserAsync(request);
    }

    async validateCredentials(email: string, password: string) {
        const user = await this.userService.findUserByEmailAsync(email);
        if (!user || !(await compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');

        return new UserEntity(user.toObject());
    }

    async loginUser(user: UserEntity) {
        const { email, id } = user;
        const token = await this.jwtService.signAsync({
            username: email,
            sub: id
        });

        return { access_token: token };
    }
}
