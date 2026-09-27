import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';

class LoginDto { @IsEmail() email!: string; @IsString() @MinLength(6) password!: string; }

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  private cookieSecure() { return process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production'); }
  @Public()
  @Post('login') async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    res.cookie('refresh_token', result.refreshToken, { httpOnly: true, sameSite: 'lax', secure: this.cookieSecure(), maxAge: 7 * 86400000 });
    return { data: { accessToken: result.accessToken, user: result.user } };
  }
  @Public()
  @Post('refresh') async refresh(@Req() req: { cookies?: Record<string, string> }) {
    return { data: await this.auth.refresh(req.cookies?.refresh_token) };
  }
  @Public()
  @Post('logout') logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'lax', secure: this.cookieSecure() });
    return { data: { success: true } };
  }
}
