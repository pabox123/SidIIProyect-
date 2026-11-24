import { ContentType } from '../catalog/catalog.dto';
import { CatalogItemDto } from './catalog-item.dto';

const PREFIX: Record<ContentType, string> = { movie: 'mov', series: 'ser', documentary: 'doc' };

export function prefixFor(type: ContentType): string {
  return PREFIX[type];
}

export function typeMatchesId(type: ContentType, id: string): boolean {
  return id.startsWith(`${PREFIX[type]}_`);
}

const unique = (values: string[]) => new Set(values).size === values.length;

/**
 * Reglas que el $jsonSchema de MongoDB no puede expresar o que conviene avisar antes
 * de intentar escribir: campos obligatorios por tipo, campos que no corresponden al tipo,
 * números únicos de temporada y de episodio por temporada, y valores repetidos.
 * Devuelve la lista de errores (vacía si todo está bien).
 */
export function validateByType(type: ContentType, dto: CatalogItemDto): string[] {
  const errors: string[] = [];
  const has = (v: unknown) => v !== undefined && v !== null;

  for (const [field, values] of [
    ['géneros', dto.genres],
    ['países', dto.productionCountries],
    ['idiomas de audio', dto.audioLanguages],
    ['idiomas de subtítulos', dto.subtitleLanguages],
  ] as const) {
    if (values && !unique(values)) errors.push(`Hay ${field} repetidos`);
  }

  if (type === 'movie' || type === 'documentary') {
    if (!has(dto.durationMinutes)) errors.push('La duración (minutos) es obligatoria');
    if (!dto.directors?.length) errors.push('Indique al menos un director');
    if (has(dto.seasons)) errors.push('Solo las series tienen temporadas');
  }

  if (type === 'movie') {
    if (!dto.cast?.length) errors.push('Indique al menos un integrante del reparto');
    for (const f of ['topics', 'interviewees', 'sources'] as const) {
      if (has(dto[f])) errors.push(`El campo ${f} solo aplica a documentales`);
    }
  }

  if (type === 'documentary') {
    if (!dto.topics?.length) errors.push('Indique al menos un tema');
    if (has(dto.cast)) errors.push('El reparto solo aplica a películas');
  }

  if (type === 'series') {
    for (const f of ['durationMinutes', 'directors', 'cast', 'topics', 'interviewees', 'sources'] as const) {
      if (has(dto[f])) errors.push(`El campo ${f} no aplica a series (la duración va en cada episodio)`);
    }
    if (!dto.seasons?.length) {
      errors.push('Una serie necesita al menos una temporada');
    } else {
      const seasonNumbers = dto.seasons.map((s) => s.seasonNumber);
      if (new Set(seasonNumbers).size !== seasonNumbers.length) {
        errors.push('Hay números de temporada repetidos');
      }
      const episodeIds: string[] = [];
      for (const season of dto.seasons) {
        const numbers = season.episodes.map((e) => e.number);
        if (new Set(numbers).size !== numbers.length) {
          errors.push(`La temporada ${season.seasonNumber} tiene números de episodio repetidos`);
        }
        for (const e of season.episodes) if (e.episodeId) episodeIds.push(e.episodeId);
      }
      if (!unique(episodeIds)) errors.push('Hay episodeId repetidos');
    }
  }

  return errors;
}
