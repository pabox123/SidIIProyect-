import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { mongodbConfig } from '@config/database.config';
import { MongodbService } from './mongodb.service';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(mongodbConfig),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = configService.get<ReturnType<typeof mongodbConfig>>('mongodb')!;
        return {
          uri: config.uri,
          dbName: config.dbName,
          maxPoolSize: config.maxPoolSize,
          minPoolSize: config.minPoolSize,
          serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
          socketTimeoutMS: config.socketTimeoutMS,
          retryWrites: config.retryWrites,
          retryReads: config.retryReads,
          autoCreate: true,
          autoIndex: process.env.NODE_ENV !== 'production',
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MongodbService],
  exports: [MongodbService],
})
export class MongodbModule {}