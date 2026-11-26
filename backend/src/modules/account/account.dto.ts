import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const ALLOWED_AGE_RATINGS = [0, 7, 12, 16, 18] as const;

export class SubscribeDto {
  @IsInt({ message: 'El planId debe ser un entero positivo' })
  @Min(1, { message: 'El planId debe ser mayor o igual a 1' })
  planId!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La referencia de pago debe ser texto' })
  @MinLength(3, { message: 'La referencia de pago debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'La referencia de pago no puede superar los 100 caracteres' })
  reference?: string;

  @IsOptional()
  @IsBoolean({ message: 'approved debe ser un valor booleano' })
  approved?: boolean;
}

export class CreateProfileDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre del perfil es obligatorio' })
  @MinLength(1, { message: 'El nombre del perfil no puede estar vacío' })
  @MaxLength(60, { message: 'El nombre del perfil no puede superar los 60 caracteres' })
  name!: string;

  @IsInt({ message: 'La clasificación máxima de edad debe ser un número entero' })
  @IsIn(ALLOWED_AGE_RATINGS, {
    message: 'La clasificación máxima de edad debe ser 0, 7, 12, 16 o 18',
  })
  maxAgeRating!: number;
}
