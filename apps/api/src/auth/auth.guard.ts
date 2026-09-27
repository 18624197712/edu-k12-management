import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';

export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

export type AuthUser = { sub: string; role: Role; name: string };
export type AuthRequest = Request & { user: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('请先登录');
    try {
      request.user = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('登录状态已失效');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(request.user.role)) throw new ForbiddenException('无权执行此操作');
    return true;
  }
}
