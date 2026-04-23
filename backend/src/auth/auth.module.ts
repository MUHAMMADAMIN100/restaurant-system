// ─── auth/dto/login.dto.ts ───────────────────────────────────────────────────
// (inline exports below for single-file convenience)

import { Module, Injectable, UnauthorizedException, Controller, Post, Get, Body, UseGuards, Request, ExecutionContext, createParamDecorator, CanActivate, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcryptjs';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { User, UserRole } from '../users/user.entity';
import { UsersModule } from '../users/users.module';

// ── DTO ──────────────────────────────────────────────────────────────────────
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  password!: string;
}

// ── JWT Strategy ─────────────────────────────────────────────────────────────
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret',
    });
  }

  async validate(payload: { sub: number; email: string; role: string }) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}

// ── Guards ───────────────────────────────────────────────────────────────────
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    return user && roles.includes(user.role);
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// ── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.email = :email', { email: dto.email })
      .getOne();

    if (!user) throw new UnauthorizedException('Пользователь не найден');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Неверный пароль');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    const { password, ...safeUser } = user as any;
    return { access_token: token, user: safeUser };
  }

  async me(user: User) {
    return user;
  }
}

// ── Controller ───────────────────────────────────────────────────────────────
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return this.authService.me(user);
  }
}

// ── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'secret',
        signOptions: { expiresIn: process.env.JWT_EXPIRES || '7d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
