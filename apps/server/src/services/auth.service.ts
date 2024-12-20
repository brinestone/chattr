import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcrypt";
import { User } from "@chattr/domain";
import { UserService } from "./user.service";
import { ISignupRequest } from "@chattr/interfaces";

@Injectable()
export class AuthService {
    constructor(private userService: UserService, private jwtService: JwtService) { }

    async doesUserExist(id: string) {
        const user = await this.userService.findByIdInternalAsync(id);
        return user != null
    }

    async signUpUser(request: ISignupRequest) {
        return this.userService.createUserAsync(request);
    }

    async validateCredentials(email: string, password: string) {
        const user = await this.userService.findUserByEmailAsync(email);
        if (!user || !(await compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');

        return new User(user.toObject());
    }

    async loginUser(user: User) {
        const { email, id, name, avatar } = user;
        const token = await this.jwtService.signAsync({
            username: email,
            displayName: name,
            avatar,
            sub: id
        });

        return { access_token: token };
    }
}
