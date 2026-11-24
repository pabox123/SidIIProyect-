import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'cineconecta.token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

export const tokenStore = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Si el servidor dice 401, se cierra la sesión local (lo escucha AuthContext). */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && tokenStore.get()) {
      window.dispatchEvent(new Event('cineconecta:unauthorized'));
    }
    return Promise.reject(error);
  },
);

/** Mensaje legible para mostrar al usuario a partir de cualquier error de la API. */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return error.code === 'ECONNABORTED'
        ? 'El servidor tardó demasiado en responder'
        : 'No hay conexión con el servidor';
    }
    const data: any = error.response.data;
    const message = data?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string' && message) return message;
    if (error.response.status === 503) return 'Un servicio de datos no está disponible en este momento';
    return `Error ${error.response.status}`;
  }
  return error instanceof Error ? error.message : 'Error inesperado';
}

/** Descarga un archivo (CSV) respetando el nombre que envía el servidor. */
export async function download(url: string, params: Record<string, string>, fallbackName: string) {
  const response = await api.get(url, { params, responseType: 'blob' });
  const disposition: string = response.headers['content-disposition'] ?? '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
