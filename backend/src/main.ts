import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import helmet from 'helmet';
import * as compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';

  // Security headers
  app.use(helmet());
  // Compression
  app.use(compression());

  // Global prefix for API routes
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Errores de BD traducidos a respuestas controladas { statusCode, message }
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL') || 'http://localhost:5173',
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  await app.listen(port);
  console.log(`🚀 CineConecta API running on http://localhost:${port}/api`);
  console.log(`📊 Health check: http://localhost:${port}/api/health`);
  console.log(`🌍 Environment: ${nodeEnv}`);
}

bootstrap();