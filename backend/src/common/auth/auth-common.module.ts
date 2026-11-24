import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthGuard, ClientAuthGuard } from './auth.guards';
import { ProfileAccessService } from '../access/profile-access.service';

/**
 * Módulo global con la verificación de tokens y de acceso a perfiles.
 * Cualquier módulo puede usar @UseGuards(ClientAuthGuard) o @UseGuards(AdminAuthGuard).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret && config.get<string>('NODE_ENV') === 'production') {
          throw new Error('JWT_SECRET es obligatorio en producción');
        }
        return {
          secret: secret || 'dev-only-secret-change-me',
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '8h' },
        };
      },
    }),
  ],
  providers: [ClientAuthGuard, AdminAuthGuard, ProfileAccessService],
  exports: [JwtModule, ClientAuthGuard, AdminAuthGuard, ProfileAccessService],
})
export class AuthCommonModule {}
