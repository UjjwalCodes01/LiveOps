import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { ApplicationConfiguration } from '../config/configuration';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const settings = this.config.getOrThrow<ApplicationConfiguration>('app');
    if (!settings.apiKeys.length)
      throw new ServiceUnavailableException(
        'API authentication is not configured.',
      );
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-api-key');
    if (
      !provided ||
      !settings.apiKeys.some((key) => this.matches(key, provided))
    )
      throw new UnauthorizedException('A valid x-api-key is required.');
    return true;
  }
  private matches(expected: string, actual: string): boolean {
    const expectedValue = Buffer.from(expected);
    const actualValue = Buffer.from(actual);
    return (
      expectedValue.length === actualValue.length &&
      timingSafeEqual(expectedValue, actualValue)
    );
  }
}
