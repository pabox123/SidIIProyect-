import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
import { AdminAuthGuard, ClientAuthGuard } from '../../common/auth/auth.guards';
import { CurrentAdmin, CurrentClient } from '../../common/auth/auth.decorators';
import { AuthenticatedAdmin, AuthenticatedClient } from '../../common/auth/auth.types';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/register')
  @HttpCode(HttpStatus.CREATED)
  registerClient(@Body() dto: RegisterDto) {
    return this.auth.registerClient(dto);
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  loginClient(@Body() dto: LoginDto) {
    return this.auth.loginClient(dto.email, dto.password);
  }

  @Get('auth/me')
  @UseGuards(ClientAuthGuard)
  me(@CurrentClient() client: AuthenticatedClient) {
    return this.auth.me(client.accountId);
  }

  @Post('admin/auth/login')
  @HttpCode(HttpStatus.OK)
  loginAdmin(@Body() dto: LoginDto) {
    return this.auth.loginAdmin(dto.email, dto.password);
  }

  @Get('admin/auth/me')
  @UseGuards(AdminAuthGuard)
  adminMe(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.auth.adminMe(admin.adminId);
  }
}
