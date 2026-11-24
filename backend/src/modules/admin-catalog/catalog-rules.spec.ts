import { validateByType } from './catalog-rules';
import { CatalogItemDto } from './catalog-item.dto';

const base = {
  title: 'X', synopsis: 'Y', releaseYear: 2024, genres: ['Drama'], productionCountries: ['CO'],
  audioLanguages: ['es'], subtitleLanguages: [], ageRating: 12, coverUrl: 'https://x/y.jpg',
};
const dto = (extra: object) => ({ ...base, ...extra }) as CatalogItemDto;

describe('validateByType', () => {
  it('acepta una película completa', () => {
    expect(validateByType('movie', dto({ durationMinutes: 90, directors: ['A'], cast: [{ name: 'B' }] }))).toEqual([]);
  });

  it('exige los campos de cada tipo', () => {
    expect(validateByType('movie', dto({}))).toEqual(
      expect.arrayContaining(['La duración (minutos) es obligatoria', 'Indique al menos un director', 'Indique al menos un integrante del reparto']),
    );
    expect(validateByType('documentary', dto({ durationMinutes: 60, directors: ['A'] }))).toContain('Indique al menos un tema');
    expect(validateByType('series', dto({}))).toContain('Una serie necesita al menos una temporada');
  });

  it('rechaza campos que no son del tipo', () => {
    expect(validateByType('series', dto({ durationMinutes: 10, seasons: [{ seasonNumber: 1, description: 'd', episodes: [{ number: 1, title: 't', synopsis: 's', durationMinutes: 40 }] }] })))
      .toEqual([expect.stringContaining('durationMinutes')]);
    expect(validateByType('movie', dto({ durationMinutes: 90, directors: ['A'], cast: [{ name: 'B' }], topics: ['x'] })))
      .toEqual([expect.stringContaining('topics')]);
  });

  it('detecta números de temporada y de episodio repetidos', () => {
    const ep = (number: number) => ({ number, title: 't', synopsis: 's', durationMinutes: 40 });
    const errors = validateByType('series', dto({
      seasons: [
        { seasonNumber: 1, description: 'a', episodes: [ep(1), ep(1)] },
        { seasonNumber: 1, description: 'b', episodes: [ep(1)] },
      ],
    }));
    expect(errors).toContain('Hay números de temporada repetidos');
    expect(errors).toContain('La temporada 1 tiene números de episodio repetidos');
  });

  it('detecta valores repetidos en listas', () => {
    expect(validateByType('movie', dto({ genres: ['Drama', 'Drama'], durationMinutes: 90, directors: ['A'], cast: [{ name: 'B' }] })))
      .toEqual(['Hay géneros repetidos']);
  });
});
