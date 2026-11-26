export type ContentType = 'movie' | 'series' | 'documentary';
export type ContentStatus = 'draft' | 'published' | 'withdrawn';
export type AdminRole = 'catalog_admin' | 'report_viewer';

export interface Profile {
  profileId: number;
  name: string;
  maxAgeRating: number;
  isActive: boolean;
}

export interface ActiveSubscription {
  subscriptionId: number;
  planId: number;
  planName: string;
  maxProfiles: number;
  startsAt: string;
  endsAt: string;
}

export interface Me {
  accountId: number;
  fullName: string;
  email: string;
  activeSubscription: ActiveSubscription | null;
  profiles: Profile[];
}

export interface AdminUser {
  adminId: string;
  fullName: string;
  email: string;
  roles: AdminRole[];
}

export interface ContentCard {
  contentId: string;
  title: string;
  type: ContentType;
  coverUrl: string;
  releaseYear: number;
  ageRating: number;
  genres?: string[];
  audioLanguages?: string[];
  durationMinutes?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Episode {
  episodeId?: string;
  number: number;
  title: string;
  synopsis: string;
  durationMinutes: number;
}

export interface Season {
  seasonNumber: number;
  description: string;
  episodes: Episode[];
}

export interface CatalogItem extends ContentCard {
  synopsis: string;
  genres: string[];
  productionCountries: string[];
  audioLanguages: string[];
  subtitleLanguages: string[];
  status: ContentStatus;
  directors?: string[];
  cast?: { name: string; character?: string }[];
  seasons?: Season[];
  topics?: string[];
  interviewees?: { name: string; role?: string }[];
  sources?: { name: string; institution?: string }[];
  publishedAt?: string;
  withdrawnAt?: string;
  updatedAt?: string;
  inMyList?: boolean;
}

export interface CatalogFilters {
  types: ContentType[];
  genres: string[];
  languages: string[];
  years: number[];
}

export interface PlaybackState {
  sessionId: string;
  status: 'open' | 'paused' | 'closed';
  durationSeconds: number;
  lastPositionSeconds: number;
  watchedSeconds: number;
  completed: boolean;
  completionReason: 'manual' | 'threshold_90' | null;
}

export interface PlaybackStart extends PlaybackState {
  title: string;
  contentType: ContentType;
  coverUrl: string;
  episode: { episodeId: string; seasonNumber: number; episodeNumber: number; title: string } | null;
  resumedFrom: number;
}

export interface ContinueWatchingItem {
  contentId: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  lastPositionSeconds: number;
  durationSeconds: number;
  lastActivityAt: string;
  title: string;
  type: ContentType;
  coverUrl: string;
}

export interface MyListItem {
  contentId: string;
  addedAt: string;
  title: string;
  type: ContentType;
  coverUrl: string;
  releaseYear: number;
  ageRating: number;
  isWithdrawn: boolean;
}

export interface RevenueRow {
  planId: number;
  planName: string;
  planPrice: number;
  subscriptions: number;
  totalRevenue: number;
}

export interface ConsumptionRow {
  planId: number;
  planName: string;
  contentType: ContentType;
  contentTypeLabel: string;
  sessions: number;
  completedSessions: number;
  distinctProfiles: number;
  minutesWatched: number;
}

export interface Report<T, Totals> {
  range: { from: string; to: string };
  rows: T[];
  totals: Totals;
}

export interface Plan {
  planId: number;
  name: string;
  price: number;
  maxProfiles: number;
}

export interface Payment {
  paymentId: number;
  subscriptionId: number;
  paidAt: string;
  amount: number;
  reference: string;
}

export interface SubscriptionRecord {
  subscriptionId: number;
  planId: number;
  planName: string;
  planPrice: number;
  maxProfiles: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  payment: Payment;
}

export interface AccountSubscriptions {
  activeSubscription: SubscriptionRecord | null;
  subscriptions: SubscriptionRecord[];
}

export interface AccountProfiles {
  profiles: (Profile & { accountId: number })[];
  activeCount: number;
  maxProfiles: number;
  hasActiveSubscription: boolean;
}
