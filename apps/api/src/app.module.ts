import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AppController } from './data/app.controller';
import { DataService } from './data/data.service';
import { PrismaService } from './data/prisma.service';
import { JwtAuthGuard } from './auth/auth.guard';

@Module({
  imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'development-secret', signOptions: { expiresIn: '15m' } })],
  controllers: [AuthController, AppController],
  providers: [AuthService, DataService, PrismaService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
