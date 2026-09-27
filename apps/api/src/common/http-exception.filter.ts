import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = error instanceof HttpException ? error.getResponse() : '服务器内部错误';
    const message = typeof detail === 'string' ? detail : (detail as { message?: string | string[] }).message || '请求失败';
    response.status(status).json({ error: { code: `HTTP_${status}`, message, timestamp: new Date().toISOString() } });
  }
}
