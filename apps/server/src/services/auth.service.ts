import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcrypt";
import { User } from "../models";
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

        return new User(user.toObject());
    }

    async loginUser(user: User) {
        const { email, id, name } = user;
        const token = await this.jwtService.signAsync({
            username: email,
            displayName: name,
            sub: id
        });

        return { access_token: token };
    }
}
