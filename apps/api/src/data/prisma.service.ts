import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { try { await this.$connect(); } catch { console.warn('Database unavailable; demo read fallbacks remain active.'); } }
  async onModuleDestroy() { await this.$disconnect(); }
}
