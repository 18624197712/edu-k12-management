import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../data/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  async login(email: string, password: string) {
    let user = await this.prisma.user.findUnique({ where: { email } }).catch(() => null);
    if (!user && email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const passwordHash = await argon2.hash(password);
      user = await this.prisma.user.create({ data: { email, name: '系统管理员', role: 'ADMIN', passwordHash } });
    }
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('邮箱或密码错误');
    const payload = { sub: user.id, role: user.role, name: user.name };
    return { accessToken: await this.jwt.signAsync(payload), refreshToken: await this.jwt.signAsync(payload, { secret: process.env.JWT_REFRESH_SECRET || 'development-refresh', expiresIn: '7d' }), user: { id: user.id, name: user.name, role: user.role } };
  }

  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException('刷新令牌不存在');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: string; name: string }>(token, { secret: process.env.JWT_REFRESH_SECRET || 'development-refresh' });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('用户不存在');
      const claims = { sub: user.id, role: user.role, name: user.name };
      return { accessToken: await this.jwt.signAsync(claims), user: { id: user.id, name: user.name, role: user.role } };
    } catch {
      throw new UnauthorizedException('刷新令牌已失效');
    }
  }
}
