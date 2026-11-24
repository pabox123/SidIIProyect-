import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const CONTENT_TYPES = ['movie', 'series', 'documentary'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export class ProfileQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'Seleccione un perfil' })
  @Min(1, { message: 'Seleccione un perfil' })
  profileId!: number;
}

export class SearchCatalogDto extends ProfileQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(CONTENT_TYPES, { message: 'Tipo de contenido no válido' })
  type?: ContentType;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  genre?: string;

  @IsOptional()
  @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { message: 'Idioma no válido' })
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1888)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 12;
}
