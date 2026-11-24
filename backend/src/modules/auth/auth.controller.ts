import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { ClientAuthGuard } from '../../common/auth/auth.guards';
import { CurrentClient } from '../../common/auth/auth.decorators';
import { AuthenticatedClient } from '../../common/auth/auth.types';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  loginClient(@Body() dto: LoginDto) {
    return this.auth.loginClient(dto.email, dto.password);
  }

  @Get('auth/me')
  @UseGuards(ClientAuthGuard)
  me(@CurrentClient() client: AuthenticatedClient) {
    return this.auth.me(client.accountId);
  }

  @Post('admin/auth/login')
  @HttpCode(200)
  loginAdmin(@Body() dto: LoginDto) {
    return this.auth.loginAdmin(dto.email, dto.password);
  }
}
