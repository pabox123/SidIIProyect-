import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool, PoolConfig } from 'pg';
import { postgresConfig } from '@config/database.config';
import { PostgresService } from './postgres.service';
import { POSTGRES_POOL } from './postgres.constants';

@Global()
@Module({
  imports: [ConfigModule.forFeature(postgresConfig)],
  providers: [
    {
      provide: POSTGRES_POOL,
      useFactory: (configService: ConfigService) => {
        const config = configService.get<ReturnType<typeof postgresConfig>>('postgres')!;
        const poolConfig: PoolConfig = {
          host: config.host,
          port: config.port,
          user: config.username,
          password: config.password,
          database: config.database,
          max: config.pool.max,
          min: config.pool.min,
          idleTimeoutMillis: config.pool.idleTimeoutMillis,
          connectionTimeoutMillis: config.pool.connectionTimeoutMillis,
          ssl: config.ssl,
          application_name: config.application_name,
        };
        return new Pool(poolConfig);
      },
      inject: [ConfigService],
    },
    PostgresService,
  ],
  exports: [POSTGRES_POOL, PostgresService],
})
export class PostgresModule {}