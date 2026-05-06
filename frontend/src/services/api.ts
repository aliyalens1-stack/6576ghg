import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from '../shared/api-contracts';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let logoutHandler: (() => Promise<void>) | null = null;

export const setLogoutHandler = (handler: () => Promise<void>) => {
  logoutHandler = handler;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (logoutHandler) {
        console.log('401 Unauthorized - Auto logout');
        await logoutHandler();
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email: string, password: string) => api.post(API.auth.login, { email, password }),
  register: (data: any) => api.post(API.auth.register, data),
  me: () => api.get(API.auth.me),
  forgotPassword: (email: string) => api.post(API.auth.forgotPassword, { email }),
  resetPassword: (token: string, password: string) => api.post(API.auth.resetPassword, { token, password }),
};

// Services API
export const servicesAPI = {
  getAll: () => api.get(API.services.list),
  getCategories: () => api.get(API.services.categories),
  getById: (id: string) => api.get(API.services.byId(id)),
};

// Organizations API
export const organizationsAPI = {
  getAll: (params?: any) => api.get(API.organizations.list, { params }),
  getById: (id: string) => api.get(API.organizations.byId(id)),
  search: (params: any) => api.get(API.organizations.search, { params }),
};

// Vehicles API
export const vehiclesAPI = {
  getMy: () => api.get(API.vehicles.my),
  create: (data: any) => api.post(API.vehicles.create, data),
  update: (id: string, data: any) => api.patch(API.vehicles.byId(id), data),
  delete: (id: string) => api.delete(API.vehicles.remove(id)),
};

// Quotes API
export const quotesAPI = {
  getMy: () => api.get(API.quotes.my),
  getById: (id: string) => api.get(API.quotes.byId(id)),
  create: (data: any) => api.post(API.quotes.create, data),
  cancel: (id: string) => api.post(`${API.quotes.byId(id)}/cancel`),
  accept: (quoteId: string, responseId: string) => api.post(`${API.quotes.byId(quoteId)}/accept/${responseId}`),
  getIncoming: () => api.get(API.quotes.incoming),
  respond: (quoteId: string, data: any) => api.post(`${API.quotes.byId(quoteId)}/respond`, data),
  quickRequest: (data: any) => api.post(API.quotes.quick, data),
  getQuickTypes: () => api.get(API.quotes.quickTypes),
};

// Matching API
export const matchingAPI = {
  findNearby: (lat: number, lng: number, serviceId?: string, limit?: number) =>
    api.get(API.matching.nearby, { params: { lat, lng, serviceId, limit } }),
  findProviders: (data: any) => api.post(API.matching.providers, data),
  findRepeat: (serviceId?: string) => api.get('/matching/repeat', { params: { serviceId } }),
};

// Bookings API
export const bookingsAPI = {
  getMy: () => api.get(API.bookings.my),
  getById: (id: string) => api.get(API.bookings.byId(id)),
  getIncoming: () => api.get(API.bookings.incoming),
  updateStatus: (id: string, status: string) => api.patch(`${API.bookings.byId(id)}/status`, { status }),
};

// Payments API — legacy methods (kept for compatibility with old booking flow)
const _legacyPaymentsAPI = {
  create: (bookingId: string) => api.post('/payments/create', { bookingId }),
  confirm: (paymentId: string) => api.post(`/payments/${paymentId}/confirm-mock`),
  getMy: () => api.get('/payments/my'),
  list: () => api.get('/payments/list'),  // compat alias
};

// Reviews API
export const reviewsAPI = {
  create: (data: any) => api.post(API.reviews.create, data),
  getByOrg: (orgId: string) => api.get(`/reviews/organization/${orgId}`),
  getByBooking: (bookingId: string) => api.get(API.reviews.byBooking(bookingId)),
  getMy: () => api.get(API.reviews.my),
};

// Map Decision Layer API
export const mapAPI = {
  getNearby: (lat: number, lng: number, radius?: number, limit?: number, filter?: string) =>
    api.get('/matching/nearby', { params: { lat, lng, radius, limit, filter } }),
  getViewport: (swLat: number, swLng: number, neLat: number, neLng: number, filter?: string) =>
    api.get('/map/providers/viewport', { params: { swLat, swLng, neLat, neLng, filter } }),
  getMatching: (lat: number, lng: number, serviceId?: string, urgency?: string, limit?: number) =>
    api.get('/map/providers/matching', { params: { lat, lng, serviceId, urgency, limit } }),
  getDirect: (providerId: string, lat: number, lng: number) =>
    api.get('/map/direct', { params: { providerId, lat, lng } }),
};

// Stage 2 — Geo + Search: cities catalogue
export interface CityDTO {
  code: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  currency: string;
  providersCount: number;
}
export const citiesAPI = {
  list: () => api.get<CityDTO[]>('/cities'),
  get: (code: string) => api.get<CityDTO>(`/cities/${code}`),
};

// Stage 2 — Marketplace providers with city filter + q search
export const marketplaceAPI = {
  getProviders: (lat: number, lng: number, radius?: number, limit?: number, city?: string, q?: string) =>
    api.get('/marketplace/providers', { params: { lat, lng, radius, limit, city, q } }),
};

// ═══════════════════════════════════════════════
// 🚀 STAGE 3 — Services + Booking (Uber-like flow)
// ═══════════════════════════════════════════════
export interface QuoteProviderSnapshot {
  name: string;
  slug: string;
  rating: number;
  reviews: number;
  tuvVerified: boolean;
  yearsExperience: number;
  type: string;
}
export interface Quote {
  id: string;
  requestId: string;
  providerSlug: string;
  provider: QuoteProviderSnapshot;
  priceFrom: number;
  currency: string;
  estimatedTimeMinutes: number;
  responseTime: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: string;
  createdAt: string;
}
export interface RequestDoc {
  id: string;
  userId: string | null;
  city: string;
  serviceKey: string;
  serviceCluster: string;
  description: string;
  status: 'searching' | 'offers' | 'booked';
  createdAt: string;
}

export const requestsAPI = {
  services: () => api.get<{ clusters: Record<string, { label: Record<string, string>; items: any[] }> }>('/services'),
  create: (data: { serviceKey: string; city: string; description?: string }) =>
    api.post<{ requestId: string; request: RequestDoc; quotes: Quote[]; status: string }>('/requests', data),
  my: () => api.get<{ requests: RequestDoc[]; total: number }>('/requests/my'),
  getQuotes: (id: string) => api.get<{ request: RequestDoc; quotes: Quote[] }>(`/requests/${id}/quotes`),
  acceptQuote: (quoteId: string) => api.post(`/quotes/${quoteId}/accept`),
};

// ═══════════════════════════════════════════════
// 💳 STAGE 4 — Payments (Stripe Checkout)
// ═══════════════════════════════════════════════
export interface CheckoutCreateResponse {
  paymentId: string;
  sessionId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  status: string;
}
export interface PaymentStatusResponse {
  sessionId: string;
  paymentId: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';
  paymentStatus: string;
  bookingId?: string | null;
  amount: number;
  currency: string;
}
export interface RevenueSummary {
  today: number;
  todayPaymentsCount: number;
  month: number;
  monthPaymentsCount: number;
  requestsToday: number;
  currency: string;
}
export const paymentsAPI = {
  createCheckout: (quoteId: string, origin: string) =>
    api.post<CheckoutCreateResponse>('/payments/create-checkout', { quoteId, origin }),
  getStatus: (sessionId: string) =>
    api.get<PaymentStatusResponse>(`/payments/status/${sessionId}`),
  mockComplete: (paymentId: string) =>
    api.post<{ status: string; bookingId: string; mock?: boolean }>(`/payments/${paymentId}/mock-complete`),
  revenueSummary: () => api.get<RevenueSummary>('/admin/revenue/summary'),
  // Legacy compat (old booking/payment.tsx flow)
  ..._legacyPaymentsAPI,
};

// Disputes API
export const disputesAPI = {
  create: (data: any) => api.post(API.disputes.create, data),
  getMy: () => api.get(API.disputes.list),
};

// Favorites API
export const favoritesAPI = {
  getMy: () => api.get(API.favorites.my),
  add: (organizationId: string) => api.post(API.favorites.toggle, { organizationId }),
  remove: (organizationId: string) => api.delete(API.favorites.remove(organizationId)),
};

// ═══════════════════════════════════════════════
// 🔥 PHASE 1: CRITICAL CONNECTION APIs
// ═══════════════════════════════════════════════

// Provider Inbox API (Uber Driver-like)
export const providerInboxAPI = {
  getInbox: () => api.get('/provider/requests/inbox'),
  getPressureSummary: () => api.get('/provider/pressure-summary'),
  getMissedRequests: () => api.get('/provider/requests/missed'),
  acceptRequest: (distributionId: string) => api.post(`/provider/requests/${distributionId}/accept`),
  rejectRequest: (distributionId: string, reason?: string) =>
    api.post(`/provider/requests/${distributionId}/reject`, { reason }),
  markViewed: (distributionId: string) => api.post(`/provider/requests/${distributionId}/view`),
  updatePresence: (isOnline: boolean, acceptsQuickRequests?: boolean) =>
    api.post('/provider/presence/update', { isOnline, acceptsQuickRequests }),

  // ─── Sprint 18: Pre-Engagement ──────────────────────────────────────
  getPreEngagement: (slug: string) => api.get(`/provider/pre-engagement/${slug}`),
  acceptPreEngagement: (slug: string, eventId?: string) =>
    api.post('/provider/pre-engage', { providerSlug: slug, eventId }),
};

// Current Job API (Live Job Management)
export const currentJobAPI = {
  getProviderCurrentJob: () => api.get('/provider/current-job'),
  updateProviderLocation: (bookingId: string, lat: number, lng: number) =>
    api.post('/provider/location/update', { bookingId, lat, lng }),
  providerAction: (bookingId: string, action: string) =>
    api.post(`/bookings/${bookingId}/action/${action}`),
};

// Live Movement API (Real-time Tracking)
export const liveAPI = {
  updateLocation: (bookingId: string, lat: number, lng: number, heading?: number, speed?: number) =>
    api.post('/live/location', { bookingId, lat, lng, heading, speed }),
  setPresence: (isOnline: boolean, lat?: number, lng?: number) =>
    api.post('/live/presence', { isOnline, lat, lng }),
  getCustomerLiveView: (bookingId: string) => api.get(`/marketplace/bookings/${bookingId}`),
  getOnlineProviders: () => api.get('/live/providers'),
};

// ═══════════════════════════════════════════════
// 🔥 PHASE 2: SURGE & DEMAND APIs
// ═══════════════════════════════════════════════

export const demandAPI = {
  getSurge: () => api.get('/admin/demand/surge'),
  getMetrics: (cityId?: string) => api.get('/admin/demand/metrics', { params: cityId ? { cityId } : {} }),
  getHeatmap: () => api.get('/demand/heatmap'),
  getHotAreas: () => api.get('/admin/demand/hot-areas'),
};

// ═══════════════════════════════════════════════
// 📍 PHASE B: ZONE & GEO APIs
// ═══════════════════════════════════════════════

export const zonesAPI = {
  // Public zone data
  getAll: () => api.get(API.zones.list),
  getById: (zoneId: string) => api.get(API.zones.byId(zoneId)),
  getLiveState: () => api.get(API.zones.liveState),
  resolve: (lat: number, lng: number) => api.get('/zones/resolve', { params: { lat, lng } }),
  getAnalytics: (zoneId: string, hours?: number) => api.get(API.zones.analytics(zoneId), { params: hours ? { hours } : {} }),
  
  // Zone-aware matching
  zoneAwareMatch: (data: { lat: number; lng: number; problem?: string; limit?: number }) =>
    api.post('/matching/zone-aware', data),
  
  // Zone-aware distribution
  distribute: (data: { lat: number; lng: number; bookingId?: string; serviceId?: string }) =>
    api.post('/distribution/zone-aware', data),
  
  // Demand
  getDemandEvents: (zoneId?: string, minutes?: number) =>
    api.get('/demand/events', { params: { zoneId, minutes } }),
  getDemandHeatmap: (minutes?: number) =>
    api.get('/demand/heatmap', { params: minutes ? { minutes } : {} }),
  trackDemandEvent: (data: { lat: number; lng: number; type: string; bookingId?: string }) =>
    api.post('/demand/event', data),
  
  // Provider locations
  getNearbyProviderLocations: (lat: number, lng: number, radius?: number) =>
    api.get('/provider/locations/nearby', { params: { lat, lng, radius: radius || 5 } }),
  getZoneProviderLocations: (zoneId: string) =>
    api.get(`/provider/locations/zone/${zoneId}`),
  updateProviderLocation: (data: { providerId: string; lat: number; lng: number; isOnline?: boolean }) =>
    api.post('/provider/location/update', data),
  updateProviderPresence: (data: { providerId: string; isOnline: boolean; lat?: number; lng?: number }) =>
    api.post('/provider/presence', data),
};

// Notifications API
export const notificationsAPI = {
  getMy: () => api.get(API.notifications.my),
  markRead: (id: string) => api.patch(API.notifications.markRead(id)),
  markAllRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get(API.notifications.unreadCount),
};

// ═══════════════════════════════════════════════
// 🧠 PHASE C: CUSTOMER INTELLIGENCE APIs
// ═══════════════════════════════════════════════

export const customerAPI = {
  // Intelligence profile
  getIntelligence: () => api.get('/customer/intelligence'),
  
  // Favorites
  getFavorites: () => api.get('/customer/favorites'),
  addFavorite: (providerId: string) => api.post('/customer/favorites', { providerId }),
  removeFavorite: (providerId: string) => api.delete(`/customer/favorites/${providerId}`),
  
  // Repeat booking
  getRepeatOptions: () => api.get('/customer/repeat-options'),
  createRepeatBooking: (data: { providerId: string; serviceId: string; vehicleId?: string }) =>
    api.post('/customer/repeat-booking', data),
  
  // Garage intelligence
  getGarageRecommendations: () => api.get('/customer/garage/recommendations'),
  
  // Unified recommendations
  getRecommendations: () => api.get('/customer/recommendations'),
  
  // History summary
  getHistorySummary: () => api.get('/customer/history/summary'),
  
  // Behavior tracking
  trackBehavior: (data: { type: string; providerId?: string; serviceId?: string; vehicleId?: string; zoneId?: string }) =>
    api.post('/customer/behavior/track', data),
};

// ═══════════════════════════════════════════════
// 🔥 PHASE D: PROVIDER INTELLIGENCE APIs
// ═══════════════════════════════════════════════

export const providerIntelligenceAPI = {
  getIntelligence: () => api.get('/provider/intelligence'),
  getEarnings: () => api.get('/provider/intelligence/earnings'),
  getDemand: () => api.get('/provider/intelligence/demand'),
  getPerformance: () => api.get('/provider/intelligence/performance'),
  getLostRevenue: () => api.get('/provider/intelligence/lost-revenue'),
  getOpportunities: () => api.get('/provider/intelligence/opportunities'),
  trackBehavior: (data: { type: string; zoneId?: string; requestId?: string; metadata?: any }) =>
    api.post('/provider/behavior/track', data),
};

// Marketplace Stats API
export const marketplaceStatsAPI = {
  getStats: () => api.get('/marketplace/stats'),
};

// ═══════════════════════════════════════════════
// 🔥 SPRINT QR-1: Quick Request "magic" + Telemetry
// ═══════════════════════════════════════════════
export const quickRequestAPI = {
  resolve: (data: { text: string; location: { lat: number; lng: number }; addressHint?: string; cluster?: string; carLink?: string }) =>
    api.post('/quick-request/resolve', data),
  getStatus: (requestId: string) => api.get(`/quick-request/${requestId}`),
  accept: (requestId: string, providerSlug: string) =>
    api.post(`/quick-request/${requestId}/accept`, { providerSlug }),
  reject: (requestId: string, providerSlug: string) =>
    api.post(`/quick-request/${requestId}/reject`, { providerSlug }),
};

export const telemetryAPI = {
  // fire-and-forget; never block UX
  track: (type: string, payload?: Record<string, any>) =>
    api.post('/system/track', { type, payload: payload || {} }),
};

// ═══════════════════════════════════════════════
// Online/Offline status — Provider Hub toggle
// ═══════════════════════════════════════════════
export const providerStatusAPI = {
  get: (providerSlug: string) =>
    api.get('/provider/status', { params: { providerSlug } }),
  set: (providerSlug: string, isOnline: boolean) =>
    api.post('/provider/status', { providerSlug, isOnline }),
};

// ═══════════════════════════════════════════════
// Inbox PRO — provider operational center
// ═══════════════════════════════════════════════
export const providerInboxProAPI = {
  getInbox: (providerSlug: string) =>
    api.get('/provider/inbox', { params: { providerSlug } }),
  bookingAction: (bookingId: string, action: 'start' | 'complete' | 'depart' | 'arrive') =>
    api.post(`/provider/booking/${bookingId}/action`, { action }),
};

export default api;
