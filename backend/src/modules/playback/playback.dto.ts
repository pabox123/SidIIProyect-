import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { PlaybackEventType } from './playback-rules';

export class StartPlaybackDto {
  @Type(() => Number) @IsInt({ message: 'Seleccione un perfil' }) @Min(1, { message: 'Seleccione un perfil' })
  profileId!: number;

  @Matches(/^(mov|ser|doc)_[0-9]{6,}$/, { message: 'Identificador de contenido no válido' })
  contentId!: string;

  @IsOptional() @Matches(/^epi_[0-9]{6,}$/, { message: 'Identificador de episodio no válido' })
  episodeId?: string;
}

export class PlaybackEventDto {
  @IsIn(['heartbeat', 'pause', 'resume', 'seek', 'finish'], { message: 'Evento no válido' })
  type!: PlaybackEventType;

  @Type(() => Number) @IsNumber() @Min(0) @Max(86400)
  positionSeconds!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(86400)
  fromSeconds?: number;
}

export class MyListItemDto {
  @Type(() => Number) @IsInt({ message: 'Seleccione un perfil' }) @Min(1, { message: 'Seleccione un perfil' })
  profileId!: number;

  @Matches(/^(mov|ser|doc)_[0-9]{6,}$/, { message: 'Identificador de contenido no válido' })
  contentId!: string;
}
