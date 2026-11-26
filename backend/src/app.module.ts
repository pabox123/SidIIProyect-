import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresModule } from './modules/db/postgres/postgres.module';
import { MongodbModule } from './modules/db/mongodb/mongodb.module';
import { HealthModule } from './modules/health/health.module';
import { AuthCommonModule } from './common/auth/auth-common.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccountModule } from './modules/account/account.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AdminCatalogModule } from './modules/admin-catalog/admin-catalog.module';
import { PlaybackModule } from './modules/playback/playback.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    // Configuration module - loads .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    // Health checks
    TerminusModule,
    // Database modules
    PostgresModule,
    MongodbModule,
    // Health module with custom checks
    HealthModule,
    // Autenticación (contrato JWT + guards) y módulos de la aplicación
    AuthCommonModule,
    AuthModule,
    AccountModule,
    CatalogModule,
    AdminCatalogModule,
    PlaybackModule,
    ReportsModule,
  ],
})
export class AppModule {}