import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminCatalogApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { CatalogItem, ContentType } from '../../api/types';
import { useToast } from '../../context/ToastContext';
import { Badge, ErrorBox, Spinner } from '../../components/ui';
import { STATUS_LABEL, TYPE_LABEL } from '../../utils/format';

interface Person { name: string; extra: string }
interface EpisodeForm { episodeId?: string; number: string; title: string; synopsis: string; durationMinutes: string }
interface SeasonForm { seasonNumber: string; description: string; episodes: EpisodeForm[] }

interface FormState {
  type: ContentType;
  title: string;
  synopsis: string;
  releaseYear: string;
  genres: string;
  productionCountries: string;
  audioLanguages: string;
  subtitleLanguages: string;
  ageRating: string;
  coverUrl: string;
  durationMinutes: string;
  directors: string;
  cast: Person[];
  topics: string;
  interviewees: Person[];
  sources: Person[];
  seasons: SeasonForm[];
}

const emptyEpisode = (n: number): EpisodeForm => ({ number: String(n), title: '', synopsis: '', durationMinutes: '' });
const emptySeason = (n: number): SeasonForm => ({ seasonNumber: String(n), description: '', episodes: [emptyEpisode(1)] });

const EMPTY: FormState = {
  type: 'movie',
  title: '',
  synopsis: '',
  releaseYear: String(new Date().getFullYear()),
  genres: '',
  productionCountries: 'CO',
  audioLanguages: 'es',
  subtitleLanguages: '',
  ageRating: '0',
  coverUrl: 'https://cdn.cineconecta.example/covers/nuevo.jpg',
  durationMinutes: '',
  directors: '',
  cast: [{ name: '', extra: '' }],
  topics: '',
  interviewees: [],
  sources: [],
  seasons: [emptySeason(1)],
};

const list = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function fromItem(item: CatalogItem): FormState {
  return {
    type: item.type,
    title: item.title,
    synopsis: item.synopsis,
    releaseYear: String(item.releaseYear),
    genres: item.genres.join(', '),
    productionCountries: item.productionCountries.join(', '),
    audioLanguages: item.audioLanguages.join(', '),
    subtitleLanguages: item.subtitleLanguages.join(', '),
    ageRating: String(item.ageRating),
    coverUrl: item.coverUrl,
    durationMinutes: item.durationMinutes ? String(item.durationMinutes) : '',
    directors: (item.directors ?? []).join(', '),
    cast: (item.cast ?? []).map((c) => ({ name: c.name, extra: c.character ?? '' })),
    topics: (item.topics ?? []).join(', '),
    interviewees: (item.interviewees ?? []).map((i) => ({ name: i.name, extra: i.role ?? '' })),
    sources: (item.sources ?? []).map((s) => ({ name: s.name, extra: s.institution ?? '' })),
    seasons: (item.seasons ?? []).map((s) => ({
      seasonNumber: String(s.seasonNumber),
      description: s.description,
      episodes: s.episodes.map((e) => ({
        episodeId: e.episodeId,
        number: String(e.number),
        title: e.title,
        synopsis: e.synopsis,
        durationMinutes: String(e.durationMinutes),
      })),
    })),
  };
}

/** Arma el cuerpo con solo los campos del tipo elegido. */
function toBody(f: FormState, includeType: boolean) {
  const people = (rows: Person[], extraKey: string) =>
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), ...(r.extra.trim() ? { [extraKey]: r.extra.trim() } : {}) }));
  const body: Record<string, unknown> = {
    ...(includeType ? { type: f.type } : {}),
    title: f.title.trim(),
    synopsis: f.synopsis.trim(),
    releaseYear: Number(f.releaseYear),
    genres: list(f.genres),
    productionCountries: list(f.productionCountries).map((c) => c.toUpperCase()),
    audioLanguages: list(f.audioLanguages),
    subtitleLanguages: list(f.subtitleLanguages),
    ageRating: Number(f.ageRating),
    coverUrl: f.coverUrl.trim(),
  };
  if (f.type !== 'series') {
    body.durationMinutes = Number(f.durationMinutes);
    body.directors = list(f.directors);
  }
  if (f.type === 'movie') body.cast = people(f.cast, 'character');
  if (f.type === 'documentary') {
    body.topics = list(f.topics);
    body.interviewees = people(f.interviewees, 'role');
    body.sources = people(f.sources, 'institution');
  }
  if (f.type === 'series') {
    body.seasons = f.seasons.map((s) => ({
      seasonNumber: Number(s.seasonNumber),
      description: s.description.trim(),
      episodes: s.episodes.map((e) => ({
        ...(e.episodeId ? { episodeId: e.episodeId } : {}),
        number: Number(e.number),
        title: e.title.trim(),
        synopsis: e.synopsis.trim(),
        durationMinutes: Number(e.durationMinutes),
      })),
    }));
  }
  return body;
}

/** Validación rápida en el navegador; la definitiva la hace el servidor. */
function quickCheck(f: FormState): string[] {
  const errors: string[] = [];
  if (!f.title.trim()) errors.push('El título es obligatorio');
  if (!f.synopsis.trim()) errors.push('La sinopsis es obligatoria');
  if (!list(f.genres).length) errors.push('Indique al menos un género');
  if (!list(f.audioLanguages).length) errors.push('Indique al menos un idioma de audio');
  if (f.type !== 'series' && !(Number(f.durationMinutes) > 0)) errors.push('La duración es obligatoria');
  if (f.type !== 'series' && !list(f.directors).length) errors.push('Indique al menos un director');
  if (f.type === 'movie' && !f.cast.some((c) => c.name.trim())) errors.push('Indique al menos un integrante del reparto');
  if (f.type === 'documentary' && !list(f.topics).length) errors.push('Indique al menos un tema');
  if (f.type === 'series') {
    f.seasons.forEach((s) =>
      s.episodes.forEach((e) => {
        if (!e.title.trim() || !e.synopsis.trim() || !(Number(e.durationMinutes) > 0)) {
          errors.push(`Complete título, sinopsis y duración del episodio ${e.number} de la temporada ${s.seasonNumber}`);
        }
      }),
    );
  }
  return errors;
}

function PeopleEditor({
  label,
  extraLabel,
  rows,
  onChange,
}: {
  label: string;
  extraLabel: string;
  rows: Person[];
  onChange: (rows: Person[]) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {rows.map((row, i) => (
        <div className="inline-row" key={i}>
          <input
            placeholder="Nombre"
            value={row.name}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
          />
          <input
            placeholder={`${extraLabel} (opcional)`}
            value={row.extra}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, extra: e.target.value } : r)))}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rows, { name: '', extra: '' }])}>
        + Agregar
      </button>
    </fieldset>
  );
}

export function AdminItemFormPage() {
  const { contentId } = useParams();
  const isNew = !contentId;
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(isNew ? EMPTY : null);
  const [current, setCurrent] = useState<CatalogItem | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    adminCatalogApi
      .get(contentId!)
      .then((item) => {
        setCurrent(item);
        setForm(fromItem(item));
      })
      .catch((err) => setErrors([errorMessage(err)]));
  }, [contentId, isNew]);

  if (!form) return errors.length ? <ErrorBox message={errors[0]} /> : <Spinner />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  const setSeason = (i: number, season: SeasonForm) => set('seasons', form.seasons.map((s, j) => (j === i ? season : s)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = quickCheck(form);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      const saved = isNew
        ? await adminCatalogApi.create(toBody(form, true))
        : await adminCatalogApi.update(contentId!, toBody(form, false));
      toast('success', isNew ? `Creado ${saved.contentId} como borrador` : 'Cambios guardados');
      navigate(`/admin/catalog/${saved.contentId}`, { replace: true });
      setCurrent(saved);
      setForm(fromItem(saved));
    } catch (err) {
      setErrors([errorMessage(err)]);
    } finally {
      setBusy(false);
    }
  };

  const transition = async (action: 'publish' | 'withdraw') => {
    if (!current) return;
    setBusy(true);
    try {
      const updated =
        action === 'publish' ? await adminCatalogApi.publish(current.contentId) : await adminCatalogApi.withdraw(current.contentId);
      setCurrent(updated);
      toast('success', action === 'publish' ? 'Contenido publicado' : 'Contenido retirado');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="page-head">
        <h1>{isNew ? 'Nuevo contenido' : `Editar ${current?.contentId ?? ''}`}</h1>
        {current && (
          <div className="row-actions">
            <Badge tone={current.status === 'published' ? 'success' : current.status === 'withdrawn' ? 'warning' : 'neutral'}>
              {STATUS_LABEL[current.status]}
            </Badge>
            {current.status !== 'published' ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => transition('publish')}>
                Publicar
              </button>
            ) : (
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => transition('withdraw')}>
                Retirar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="form-grid">
        <label>
          Tipo
          <select value={form.type} disabled={!isNew} onChange={(e) => set('type', e.target.value as ContentType)}>
            {(['movie', 'series', 'documentary'] as ContentType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Título *
          <input value={form.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label>
          Año *
          <input type="number" value={form.releaseYear} onChange={(e) => set('releaseYear', e.target.value)} />
        </label>
        <label>
          Clasificación *
          <select value={form.ageRating} onChange={(e) => set('ageRating', e.target.value)}>
            {[0, 7, 12, 16, 18].map((r) => (
              <option key={r} value={r}>
                {r === 0 ? 'Todo público' : `+${r}`}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Portada (URL) *
          <input value={form.coverUrl} onChange={(e) => set('coverUrl', e.target.value)} />
        </label>
        <label className="span-3">
          Sinopsis *
          <textarea rows={3} value={form.synopsis} onChange={(e) => set('synopsis', e.target.value)} />
        </label>
        <label>
          Géneros * <small>(separados por coma)</small>
          <input value={form.genres} onChange={(e) => set('genres', e.target.value)} placeholder="Drama, Familia" />
        </label>
        <label>
          Países * <small>(ISO: CO, MX)</small>
          <input value={form.productionCountries} onChange={(e) => set('productionCountries', e.target.value)} />
        </label>
        <label>
          Idiomas de audio * <small>(es, en)</small>
          <input value={form.audioLanguages} onChange={(e) => set('audioLanguages', e.target.value)} />
        </label>
        <label>
          Subtítulos <small>(es, en)</small>
          <input value={form.subtitleLanguages} onChange={(e) => set('subtitleLanguages', e.target.value)} />
        </label>
        {form.type !== 'series' && (
          <>
            <label>
              Duración (min) *
              <input type="number" value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
            </label>
            <label>
              Dirección * <small>(separados por coma)</small>
              <input value={form.directors} onChange={(e) => set('directors', e.target.value)} />
            </label>
          </>
        )}
        {form.type === 'documentary' && (
          <label>
            Temas * <small>(separados por coma)</small>
            <input value={form.topics} onChange={(e) => set('topics', e.target.value)} />
          </label>
        )}
      </div>

      {form.type === 'movie' && (
        <PeopleEditor label="Reparto *" extraLabel="Personaje" rows={form.cast} onChange={(rows) => set('cast', rows)} />
      )}
      {form.type === 'documentary' && (
        <>
          <PeopleEditor label="Entrevistados" extraLabel="Rol" rows={form.interviewees} onChange={(rows) => set('interviewees', rows)} />
          <PeopleEditor label="Fuentes" extraLabel="Institución" rows={form.sources} onChange={(rows) => set('sources', rows)} />
        </>
      )}

      {form.type === 'series' && (
        <div className="seasons-editor">
          {form.seasons.map((season, i) => (
            <fieldset key={i}>
              <legend>
                Temporada
                <input
                  className="num"
                  type="number"
                  value={season.seasonNumber}
                  onChange={(e) => setSeason(i, { ...season, seasonNumber: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={form.seasons.length === 1}
                  onClick={() => set('seasons', form.seasons.filter((_, j) => j !== i))}
                >
                  Quitar temporada
                </button>
              </legend>
              <input
                placeholder="Descripción de la temporada *"
                value={season.description}
                onChange={(e) => setSeason(i, { ...season, description: e.target.value })}
              />
              {season.episodes.map((ep, k) => {
                const setEp = (changes: Partial<EpisodeForm>) =>
                  setSeason(i, { ...season, episodes: season.episodes.map((x, j) => (j === k ? { ...x, ...changes } : x)) });
                return (
                  <div className="episode-row" key={ep.episodeId ?? `new-${k}`}>
                    <input className="num" type="number" title="Número" value={ep.number} onChange={(e) => setEp({ number: e.target.value })} />
                    <input placeholder="Título *" value={ep.title} onChange={(e) => setEp({ title: e.target.value })} />
                    <input placeholder="Sinopsis *" value={ep.synopsis} onChange={(e) => setEp({ synopsis: e.target.value })} />
                    <input className="num" type="number" placeholder="min" title="Duración (min)" value={ep.durationMinutes} onChange={(e) => setEp({ durationMinutes: e.target.value })} />
                    <small className="muted">{ep.episodeId ?? 'nuevo'}</small>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={season.episodes.length === 1}
                      onClick={() => setSeason(i, { ...season, episodes: season.episodes.filter((_, j) => j !== k) })}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSeason(i, { ...season, episodes: [...season.episodes, emptyEpisode(season.episodes.length + 1)] })}
              >
                + Episodio
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => set('seasons', [...form.seasons, emptySeason(form.seasons.length + 1)])}
          >
            + Temporada
          </button>
        </div>
      )}

      {errors.length > 0 && (
        <div className="error-box" role="alert">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando...' : isNew ? 'Crear como borrador' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/admin/catalog')}>
          Volver
        </button>
      </div>
    </form>
  );
}
