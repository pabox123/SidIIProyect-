import { api } from './client';
import type {
  AccountProfiles,
  AccountSubscriptions,
  AdminUser,
  Plan,
  SubscriptionRecord,
  CatalogFilters,
  CatalogItem,
  ConsumptionRow,
  ContentCard,
  ContentStatus,
  ContentType,
  ContinueWatchingItem,
  Me,
  MyListItem,
  Page,
  PlaybackStart,
  PlaybackState,
  Report,
  RevenueRow,
} from './types';

export interface SearchParams {
  profileId: number;
  q?: string;
  type?: ContentType | '';
  genre?: string;
  language?: string;
  year?: number | '';
  page?: number;
  pageSize?: number;
}

const clean = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string }>('/auth/login', { email, password }).then((r) => r.data),
  adminLogin: (email: string, password: string) =>
    api.post<{ accessToken: string; admin: AdminUser }>('/admin/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get<Me>('/auth/me').then((r) => r.data),
  register: (fullName: string, email: string, password: string) =>
    api.post<{ accessToken: string }>('/auth/register', { fullName, email, password }).then((r) => r.data),
};

export const accountApi = {
  plans: () => api.get<Plan[]>('/plans').then((r) => r.data),
  subscriptions: () => api.get<AccountSubscriptions>('/account/subscriptions').then((r) => r.data),
  subscribe: (planId: number, approved: boolean) =>
    api.post<SubscriptionRecord>('/account/subscriptions', { planId, approved }).then((r) => r.data),
  profiles: () => api.get<AccountProfiles>('/account/profiles').then((r) => r.data),
  createProfile: (name: string, maxAgeRating: number) =>
    api.post('/account/profiles', { name, maxAgeRating }).then((r) => r.data),
  setProfileActive: (profileId: number, active: boolean) =>
    api.patch(`/account/profiles/${profileId}/${active ? 'activate' : 'deactivate'}`).then((r) => r.data),
};

export const catalogApi = {
  search: (params: SearchParams) =>
    api.get<Page<ContentCard>>('/catalog', { params: clean(params) }).then((r) => r.data),
  filters: () => api.get<CatalogFilters>('/catalog/filters').then((r) => r.data),
  detail: (contentId: string, profileId: number) =>
    api.get<CatalogItem>(`/catalog/${contentId}`, { params: { profileId } }).then((r) => r.data),
};

export const playbackApi = {
  start: (profileId: number, contentId: string, episodeId?: string) =>
    api.post<PlaybackStart>('/playback/sessions', clean({ profileId, contentId, episodeId })).then((r) => r.data),
  event: (sessionId: string, type: string, positionSeconds: number, fromSeconds?: number) =>
    api
      .post<PlaybackState>(`/playback/sessions/${sessionId}/events`, clean({ type, positionSeconds, fromSeconds }))
      .then((r) => r.data),
  continueWatching: (profileId: number) =>
    api.get<ContinueWatchingItem[]>('/playback/continue-watching', { params: { profileId } }).then((r) => r.data),
};

export const myListApi = {
  list: (profileId: number) => api.get<MyListItem[]>('/my-list', { params: { profileId } }).then((r) => r.data),
  add: (profileId: number, contentId: string) => api.post('/my-list', { profileId, contentId }).then((r) => r.data),
  remove: (profileId: number, contentId: string) =>
    api.delete(`/my-list/${contentId}`, { params: { profileId } }).then((r) => r.data),
};

export const adminCatalogApi = {
  list: (params: { q?: string; type?: ContentType | ''; status?: ContentStatus | ''; page?: number }) =>
    api.get<Page<CatalogItem>>('/admin/catalog', { params: clean(params) }).then((r) => r.data),
  get: (contentId: string) => api.get<CatalogItem>(`/admin/catalog/${contentId}`).then((r) => r.data),
  create: (body: object) => api.post<CatalogItem>('/admin/catalog', body).then((r) => r.data),
  update: (contentId: string, body: object) =>
    api.put<CatalogItem>(`/admin/catalog/${contentId}`, body).then((r) => r.data),
  publish: (contentId: string) => api.post<CatalogItem>(`/admin/catalog/${contentId}/publish`).then((r) => r.data),
  withdraw: (contentId: string) => api.post<CatalogItem>(`/admin/catalog/${contentId}/withdraw`).then((r) => r.data),
};

export const reportsApi = {
  revenue: (from: string, to: string) =>
    api
      .get<Report<RevenueRow, { subscriptions: number; totalRevenue: number }>>('/admin/reports/revenue', {
        params: { from, to },
      })
      .then((r) => r.data),
  consumption: (from: string, to: string) =>
    api
      .get<Report<ConsumptionRow, { sessions: number; minutesWatched: number }>>('/admin/reports/consumption', {
        params: { from, to },
      })
      .then((r) => r.data),
};
