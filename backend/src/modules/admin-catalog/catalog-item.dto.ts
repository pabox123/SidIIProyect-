import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONTENT_TYPES, ContentType } from '../catalog/catalog.dto';

export const AGE_RATINGS = [0, 7, 12, 16, 18] as const;
const LANG = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export class CastMemberDto {
  @IsString() @IsNotEmpty({ message: 'Cada integrante del reparto necesita nombre' }) @MaxLength(150)
  name!: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)
  character?: string;
}

export class IntervieweeDto {
  @IsString() @IsNotEmpty({ message: 'Cada entrevistado necesita nombre' }) @MaxLength(150)
  name!: string;

  @IsOptional() @IsString() @MaxLength(150)
  role?: string;
}

export class SourceDto {
  @IsString() @IsNotEmpty({ message: 'Cada fuente necesita nombre' }) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(200)
  institution?: string;
}

export class EpisodeDto {
  /** Se conserva al editar; si falta, el servidor lo genera (epi_XXXXXXX). */
  @IsOptional() @Matches(/^epi_[0-9]{6,}$/, { message: 'episodeId no válido' })
  episodeId?: string;

  @Type(() => Number) @IsInt({ message: 'El número de episodio debe ser entero' }) @Min(1)
  number!: number;

  @IsString() @IsNotEmpty({ message: 'Cada episodio necesita título' }) @MaxLength(200)
  title!: string;

  @IsString() @IsNotEmpty({ message: 'Cada episodio necesita sinopsis' })
  synopsis!: string;

  @Type(() => Number) @IsInt({ message: 'La duración del episodio debe ser entera (minutos)' }) @Min(1) @Max(600)
  durationMinutes!: number;
}

export class SeasonDto {
  @Type(() => Number) @IsInt({ message: 'El número de temporada debe ser entero' }) @Min(1)
  seasonNumber!: number;

  @IsString() @IsNotEmpty({ message: 'Cada temporada necesita descripción' })
  description!: string;

  @IsArray() @ArrayMinSize(1, { message: 'Cada temporada necesita al menos un episodio' })
  @ValidateNested({ each: true }) @Type(() => EpisodeDto)
  episodes!: EpisodeDto[];
}

/** Cuerpo para crear/editar un contenido. Los campos por tipo se exigen en validateByType. */
export class CatalogItemDto {
  @IsOptional() @IsIn(CONTENT_TYPES, { message: 'El tipo debe ser movie, series o documentary' })
  type?: ContentType;

  @IsString() @IsNotEmpty({ message: 'El título es obligatorio' }) @MaxLength(200)
  title!: string;

  @IsString() @IsNotEmpty({ message: 'La sinopsis es obligatoria' })
  synopsis!: string;

  @Type(() => Number) @IsInt({ message: 'El año debe ser entero' }) @Min(1888) @Max(2100)
  releaseYear!: number;

  @IsArray() @ArrayMinSize(1, { message: 'Indique al menos un género' })
  @IsString({ each: true }) @IsNotEmpty({ each: true })
  genres!: string[];

  @IsArray() @ArrayMinSize(1, { message: 'Indique al menos un país de producción' })
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'Los países van en código ISO de dos letras (CO, MX...)' })
  productionCountries!: string[];

  @IsArray() @ArrayMinSize(1, { message: 'Indique al menos un idioma de audio' })
  @Matches(LANG, { each: true, message: 'Los idiomas van en código IETF (es, en, pt-BR...)' })
  audioLanguages!: string[];

  @IsArray()
  @Matches(LANG, { each: true, message: 'Los idiomas van en código IETF (es, en, pt-BR...)' })
  subtitleLanguages!: string[];

  @Type(() => Number) @IsIn(AGE_RATINGS, { message: 'La clasificación debe ser 0, 7, 12, 16 o 18' })
  ageRating!: number;

  @IsString() @Matches(/^https?:\/\//, { message: 'La portada debe ser una URL http(s)' }) @MaxLength(500)
  coverUrl!: string;

  // Película y documental
  @IsOptional() @Type(() => Number) @IsInt({ message: 'La duración debe ser entera (minutos)' }) @Min(1) @Max(1000)
  durationMinutes?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) @IsNotEmpty({ each: true })
  directors?: string[];

  // Película
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CastMemberDto)
  cast?: CastMemberDto[];

  // Serie
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SeasonDto)
  seasons?: SeasonDto[];

  // Documental
  @IsOptional() @IsArray() @IsString({ each: true }) @IsNotEmpty({ each: true })
  topics?: string[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => IntervieweeDto)
  interviewees?: IntervieweeDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SourceDto)
  sources?: SourceDto[];
}

export class AdminCatalogQueryDto {
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsIn(CONTENT_TYPES)
  type?: ContentType;

  @IsOptional() @IsIn(['draft', 'published', 'withdrawn'])
  status?: 'draft' | 'published' | 'withdrawn';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 20;
}
