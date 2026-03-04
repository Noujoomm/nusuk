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
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

// Global unhandled error handlers
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  const config = app.get(ConfigService);

  // Port: API_PORT (single-service) > PORT (standalone) > 4000 (default)
  const port = parseInt(
    config.get<string>('API_PORT') || config.get<string>('PORT') || '4000',
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
  Logger.log(`Environment: ${isProduction ? 'production' : 'development'}`, 'Bootstrap');
  Logger.log(`Port: ${port}`, 'Bootstrap');
  Logger.log(`CORS_ORIGINS: ${origins}`, 'Bootstrap');
  Logger.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`, 'Bootstrap');

  // Trust proxy for Railway / Render / reverse proxies
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

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

  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Socket.IO adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  await app.listen(port, '0.0.0.0');
  Logger.log(
    `API running on http://0.0.0.0:${port} [${isProduction ? 'production' : 'development'}]`,
    'Bootstrap',
  );
}
bootstrap().catch((err) => {
  console.error('BOOTSTRAP FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
