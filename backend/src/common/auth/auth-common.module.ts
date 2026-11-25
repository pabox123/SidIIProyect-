import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthGuard, ClientAuthGuard, JwtAuthGuard } from './auth.guards';
import { AccountOwnershipGuard, ProfileOwnershipGuard } from './ownership.guards';
import { ProfileAccessService } from '../access/profile-access.service';

/**
 * Módulo global con la verificación de tokens y de pertenencia de cuentas/perfiles.
 * Cualquier módulo puede usar @UseGuards(ClientAuthGuard), @UseGuards(JwtAuthGuard),
 * @UseGuards(AccountOwnershipGuard), @UseGuards(ProfileOwnershipGuard) o @UseGuards(AdminAuthGuard).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('La variable de entorno JWT_SECRET es obligatoria');
        }
        return {
          secret,
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '8h' },
        };
      },
    }),
  ],
  providers: [
    JwtAuthGuard,
    ClientAuthGuard,
    AdminAuthGuard,
    AccountOwnershipGuard,
    ProfileOwnershipGuard,
    ProfileAccessService,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    ClientAuthGuard,
    AdminAuthGuard,
    AccountOwnershipGuard,
    ProfileOwnershipGuard,
    ProfileAccessService,
  ],
})
export class AuthCommonModule {}
