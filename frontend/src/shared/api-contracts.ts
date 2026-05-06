/**
 * API Contract Catalogue — Sprint 5
 *
 * Single source of truth for all backend API paths used by this client.
 *
 * RULES:
 *   • Never hardcode URL strings in pages or services — always import from here.
 *   • Dynamic segments → functions:  byId: (id) => `/resource/${id}`.
 *   • Keep this file in sync with backend contracts (see /app/memory/CURRENT_ARCHITECTURE_BASELINE.md).
 *   • Client-facing canonical path is preferred (e.g. `/favorites/my`, `/notifications/my`)
 *     even when backend accepts both — compat aliases stay in FastAPI.
 *
 * Auto-update rule: if backend adds/changes a route, this file must be updated
 * and `bash /app/ops/smoke-api-contracts.sh` must still pass.
 */

export const API = {
  // ─── Auth ─────────────────────────────────────────────────
  auth: {
    login:          '/auth/login',
    register:       '/auth/register',
    me:             '/auth/me',
    forgotPassword: '/auth/forgot-password',
    resetPassword:  '/auth/reset-password',
  },

  // ─── Customer domain ──────────────────────────────────────
  notifications: {
    my:          '/notifications/my',
    list:        '/notifications',
    unreadCount: '/notifications/unread-count',
    markRead:    (id: string) => `/notifications/${id}/read`,
  },
  favorites: {
    my:          '/favorites/my',
    list:        '/favorites',
    toggle:      '/favorites',
    remove:      (id: string) => `/favorites/${id}`,
  },
  bookings: {
    my:          '/bookings/my',
    incoming:    '/bookings/incoming',
    byId:        (id: string) => `/bookings/${id}`,
    create:      '/bookings',
    cancel:      (id: string) => `/bookings/${id}/cancel`,
  },
  quotes: {
    my:          '/quotes/my',
    incoming:    '/quotes/incoming',
    create:      '/quotes',
    quick:       '/quotes/quick',
    quickTypes:  '/quotes/quick/types',
    byId:        (id: string) => `/quotes/${id}`,
  },
  vehicles: {
    my:          '/vehicles/my',
    byId:        (id: string) => `/vehicles/${id}`,
    create:      '/vehicles',
    remove:      (id: string) => `/vehicles/${id}`,
  },
  garage: {
    byId:        (id: string) => `/garage/${id}`,
  },
  reviews: {
    my:          '/reviews/my',
    create:      '/reviews',
    byBooking:   (id: string) => `/reviews/by-booking/${id}`,
  },
  disputes: {
    list:        '/disputes/my',
    create:      '/disputes',
    byId:        (id: string) => `/disputes/${id}`,
  },

  // ─── Marketplace (public) ─────────────────────────────────
  organizations: {
    list:        '/organizations',
    search:      '/organizations/search',
    byId:        (id: string) => `/organizations/${id}`,
    bySlug:      (slug: string) => `/organizations/slug/${slug}`,
  },
  services: {
    list:        '/services',
    categories:  '/services/categories',
    byId:        (id: string) => `/services/${id}`,
  },
  marketplace: {
    providers:       '/marketplace/providers',
    services:        '/marketplace/services',
    stats:           '/marketplace/stats',
    quickRequest:    '/marketplace/quick-request',
    createBooking:   '/marketplace/bookings',
    booking:         (id: string) => `/marketplace/bookings/${id}`,
    providerInbox:   '/marketplace/provider/inbox',
    providerStats:   '/marketplace/provider/stats',
    providerCurrent: '/marketplace/provider/current-job',
  },
  matching: {
    nearby:      '/matching/nearby',
    providers:   '/matching/providers',
  },
  slots: {
    reserve:     '/slots/reserve',
  },
  experiments: {
    active:      '/experiments/active',
  },

  // ─── Provider domain ──────────────────────────────────────
  provider: {
    inbox:           '/provider/requests/inbox',
    currentJob:      '/provider/current-job',
    earnings:        '/provider/earnings',
    pressureSummary: '/provider/pressure-summary',
    availability:    '/provider/availability',
    presenceUpdate:  '/provider/presence/update',
    intelligence:    '/provider/intelligence',
    opportunities:   '/provider/intelligence/opportunities',
    billingProducts: '/provider/billing/products',
    billingCheckout: '/provider/billing/checkout',
  },

  // ─── Zones / Engine ───────────────────────────────────────
  zones: {
    list:        '/zones',
    liveState:   '/zones/live-state',
    byId:        (id: string) => `/zones/${id}`,
    analytics:   (id: string) => `/zones/${id}/analytics`,
  },
  demand: {
    heatmap:     '/demand/heatmap',
  },
  orchestrator: {
    state:       '/orchestrator/state',
    rules:       '/orchestrator/rules',
    overrides:   '/orchestrator/overrides',
    logs:        '/orchestrator/logs',
  },
  feedback: {
    dashboard:       '/feedback/dashboard',
    strategy:        '/feedback/strategy',
    recommendations: '/feedback/recommendations',
  },

  // ─── Admin ────────────────────────────────────────────────
  admin: {
    dashboard:        '/admin/dashboard',
    liveFeed:         '/admin/live-feed',
    alerts:           '/admin/alerts',
    users:            '/admin/users',
    bookings:         '/admin/bookings',
    monetization:     '/admin/monetization',
    governance:       '/admin/governance/score',
    featureFlags:     '/admin/feature-flags', // canonical (Sprint 14: featureFlagsAlt removed)
    commissionTiers:  '/admin/config/commission-tiers',
    automation:       '/admin/automation/dashboard',
    automationReplay: '/admin/automation/replay',
    auditLog:         '/admin/audit-log',
  },

  // ─── Realtime ─────────────────────────────────────────────
  realtime: {
    status:      '/realtime/status',
    events:      '/realtime/events',
    emit:        '/realtime/emit',
    // Socket.io path (used by client at namespace '/realtime'):
    socketPath:  '/api/socket.io/',
    namespace:   '/realtime',
  },

  // ─── Health ───────────────────────────────────────────────
  health: '/health',
} as const;

export type ApiCatalogue = typeof API;
export default API;
