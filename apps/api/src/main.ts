// Polyfill crypto for Node.js < 19 (required by @nestjs/schedule)
if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require('crypto');
  globalThis.crypto = webcrypto as Crypto;
}

// Application Insights must be initialized before any other imports
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const appInsights = require('applicationinsights');
  appInsights
    .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .start();
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

// Global unhandled error handlers
process.on('uncaughtException', (err) => {
  Logger.error(`UNCAUGHT EXCEPTION: ${err.message}`, err.stack, 'Process');
});
process.on('unhandledRejection', (reason) => {
  Logger.error(`UNHANDLED REJECTION: ${reason}`, undefined, 'Process');
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const config = app.get(ConfigService);

  // Port: API_PORT (co-located with frontend) > 4000 (default)
  // PORT is reserved for the public-facing frontend (8080)
  const port = parseInt(
    config.get<string>('API_PORT') || '4000',
    10,
  );
  const origins = config.get<string>('CORS_ORIGINS', 'http://localhost:3000');
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  // Startup env validation (no secrets leaked)
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length) {
    Logger.warn(`Missing env vars: ${missing.join(', ')}`, 'Bootstrap');
  }
  Logger.log(`ENV: ${isProduction ? 'production' : 'dev'} | PORT: ${port} | DB: ${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`, 'Bootstrap');

  // Trust proxy for Railway / Render / reverse proxies
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Serve uploaded files statically
  expressApp.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // Increase body size limit for large file imports (PPTX, XML, etc.)
  app.use(json({ limit: '500mb' }));
  app.use(urlencoded({ extended: true, limit: '500mb' }));

  // Security
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());

  // CORS — handle '*' correctly with credentials
  const allowedOrigins = origins.split(',').map((o) => o.trim());
  const corsOrigin = allowedOrigins.includes('*')
    ? true // reflect request origin (required when credentials: true)
    : allowedOrigins;
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['health', ''] });

  // Enable graceful shutdown hooks (Prisma disconnect, etc.)
  app.enableShutdownHooks();

  // Socket.IO adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Increase timeout for large file uploads (10 minutes)
  const server = await app.listen(port, '0.0.0.0');
  server.setTimeout(600000); // 10 minutes
  server.keepAliveTimeout = 620000; // slightly longer than setTimeout
  server.headersTimeout = 630000; // slightly longer than keepAliveTimeout

  Logger.log(
    `API running on http://0.0.0.0:${port} [${isProduction ? 'production' : 'development'}] (timeout: 600s)`,
    'Bootstrap',
  );
}
bootstrap().catch((err) => {
  Logger.error(`BOOTSTRAP FAILED: ${err.message}`, err.stack, 'Bootstrap');
  process.exit(1);
});
