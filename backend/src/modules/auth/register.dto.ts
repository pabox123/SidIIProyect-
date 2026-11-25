import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre completo es obligatorio' })
  @MinLength(2, { message: 'El nombre completo debe tener al menos 2 caracteres' })
  @MaxLength(150, { message: 'El nombre completo no puede superar los 150 caracteres' })
  fullName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo no puede superar los 254 caracteres' })
  email!: string;

  @IsString({ message: 'La contraseña es obligatoria' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres' })
  password!: string;
}
