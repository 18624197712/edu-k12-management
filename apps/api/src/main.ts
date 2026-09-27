import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const configuredOrigins = (process.env.WEB_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  const allowedOrigins = new Set([...configuredOrigins, 'http://localhost:5173', 'http://127.0.0.1:5173']);
  app.enableCors({ origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => callback(null, !origin || allowedOrigins.has(origin)), credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  const config = new DocumentBuilder().setTitle('学途教育 API').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.PORT || 3000));
}
bootstrap();
