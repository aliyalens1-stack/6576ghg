import axios from 'axios';
import { API } from '../shared/api-contracts';

const API_URL = '/api';
const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
api.interceptors.response.use((r) => r, (e) => {
  if (e.response?.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/api/web-app/login'; }
  return Promise.reject(e);
});

export const authAPI = {
  login:    (email: string, password: string) => api.post(API.auth.login, { email, password }),
  register: (data: any)                        => api.post(API.auth.register, data),
  me:       ()                                 => api.get(API.auth.me),
  forgotPassword: (email: string)              => api.post(API.auth.forgotPassword, { email }),
  resetPassword:  (token: string, password: string) => api.post(API.auth.resetPassword, { token, password }),
};
export const servicesAPI = {
  getAll:        () => api.get(API.services.list),
  getCategories: () => api.get(API.services.categories),
};
export const quotesAPI = {
  getMy:         () => api.get(API.quotes.my),
  create:        (d: any) => api.post(API.quotes.create, d),
  quickRequest:  (d: any) => api.post(API.quotes.quick, d),
  getQuickTypes: () => api.get(API.quotes.quickTypes),
  getIncoming:   () => api.get(API.quotes.incoming),
  respond:       (id: string, d: any) => api.post(`${API.quotes.byId(id)}/respond`, d),
  accept:        (qid: string, rid: string) => api.post(`${API.quotes.byId(qid)}/accept/${rid}`),
};
export const bookingsAPI = {
  getMy:        () => api.get(API.bookings.my),
  getById:      (id: string) => api.get(API.bookings.byId(id)),
  getIncoming:  () => api.get(API.bookings.incoming),
  updateStatus: (id: string, status: string) => api.patch(`${API.bookings.byId(id)}/status`, { status }),
};
export const matchingAPI = {
  findNearby:    (lat: number, lng: number, serviceId?: string) =>
    api.get(API.matching.nearby, { params: { lat, lng, serviceId, limit: 5 } }),
  findProviders: (d: any) => api.post(API.matching.providers, d),
};
// Marketplace API (web platform)
export const marketplaceAPI = {
  getProviders: (lat?: number, lng?: number, radius?: number) =>
    api.get(API.marketplace.providers, { params: { lat, lng, radius } }),
  getProviderDetail:   (slug: string) => api.get(`${API.marketplace.providers}/${slug}`),
  getServices:         () => api.get(API.marketplace.services),
  getStats:            () => api.get(API.marketplace.stats),
  quickRequest:        (d: any) => api.post(API.marketplace.quickRequest, d),
  getProviderSlots:    (slug: string, date?: string) =>
    api.get(`/marketplace/provider/${slug}/slots`, { params: { date } }),
  createBooking:       (d: any) => api.post(API.marketplace.createBooking, d),
  getBooking:          (id: string) => api.get(API.marketplace.booking(id)),
  updateBookingStatus: (id: string, status: string) =>
    api.patch(`${API.marketplace.booking(id)}/status`, { status }),
  cancelBooking:       (id: string, reason: string) =>
    api.post(`${API.marketplace.booking(id)}/cancel`, { reason }),
  reviewBooking:       (id: string, rating: number, comment: string) =>
    api.post(`${API.marketplace.booking(id)}/review`, { rating, comment }),
  simulateProgress:    (id: string) =>
    api.post(`${API.marketplace.booking(id)}/simulate-progress`),
};

// Provider Execution API (legacy marketplace/provider/* endpoints)
export const providerAPI = {
  getInbox:       () => api.get(API.marketplace.providerInbox),
  acceptRequest:  (id: string) => api.post(`/marketplace/provider/requests/${id}/accept`),
  rejectRequest:  (id: string, reason: string) => api.post(`/marketplace/provider/requests/${id}/reject`, { reason }),
  getCurrentJob:  () => api.get(API.marketplace.providerCurrent),
  jobAction:      (id: string, action: string) => api.post(`/marketplace/provider/current-job/${id}/action`, { action }),
  getStats:       () => api.get(API.marketplace.providerStats),

  // Sprint 15 — Quick-Request live dispatch
  getQuickRequestInbox: (slug: string) => api.get(`/quick-request/inbox/${slug}`),
  acceptQuickRequest:   (id: string, slug: string) =>
    api.post(`/quick-request/${id}/accept`, { providerSlug: slug }),
  rejectQuickRequest:   (id: string, slug: string) =>
    api.post(`/quick-request/${id}/reject`, { providerSlug: slug }),
};

// Billing & Growth API
export const billingAPI = {
  getProducts:    () => api.get(API.provider.billingProducts),
  getStatus:      (slug: string) => api.get(`/provider/billing/status?provider_slug=${slug}`),
  checkout:       (data: any) => api.post(API.provider.billingCheckout, data),
  getPurchases:   (slug: string) => api.get(`/provider/billing/purchases?provider_slug=${slug}`),
  getPressure:    (slug: string) => api.get(`/provider/pressure?provider_slug=${slug}`),
  getTier:        (slug: string) => api.get(`/provider/tier?provider_slug=${slug}`),
  getExperiments: () => api.get(API.experiments.active),
};

// Berlin Launch B2 — mobile.de listing parser
export const parsersAPI = {
  parseCarLink: (url: string) => api.post('/parse/car-link', { url }),
  supportedSources: () => api.get('/parse/supported-sources'),
};

// Berlin Launch B1 — Inspection Report
export const inspectionAPI = {
  generateReport: (payload: { url?: string; price?: number; mileage?: number; year?: number; fuel?: string; title?: string; make?: string; model?: string; }) =>
    api.post('/inspection/report/generate', payload),
};

// Aliases for ProviderBillingPage
Object.assign(marketplaceAPI, {
  getBillingProducts:  () => billingAPI.getProducts(),
  getBillingStatus:    (slug: string) => billingAPI.getStatus(slug),
  billingCheckout:     (data: any) => billingAPI.checkout(data),
  getBillingPurchases: (slug: string) => billingAPI.getPurchases(slug),
  getProviderPressure: (slug: string) => billingAPI.getPressure(slug),
  getProviderTier:     (slug: string) => billingAPI.getTier(slug),
  getExperiments:      () => billingAPI.getExperiments(),
});

export const vehiclesAPI = {
  getMy:  () => api.get(API.vehicles.my),
  create: (d: any) => api.post(API.vehicles.create, d),
  delete: (id: string) => api.delete(API.vehicles.remove(id)),
};
export const providerInboxAPI = {
  getInbox:       () => api.get(API.provider.inbox),
  getPressure:    () => api.get(API.provider.pressureSummary),
  acceptRequest:  (id: string) => api.post(`/provider/requests/${id}/accept`),
  rejectRequest:  (id: string, reason?: string) => api.post(`/provider/requests/${id}/reject`, { reason }),
  updatePresence: (isOnline: boolean) => api.post(API.provider.presenceUpdate, { isOnline }),
};
export const currentJobAPI = {
  get:    () => api.get(API.provider.currentJob),
  action: (bookingId: string, action: string) => api.post(`${API.bookings.byId(bookingId)}/action/${action}`),
};
export const earningsAPI = {
  get: () => api.get(API.provider.earnings),
};
export const reviewsAPI = {
  create: (d: any) => api.post(API.reviews.create, d),
  getMy:  () => api.get(API.reviews.my),
};
export const notificationsAPI = {
  getMy:          () => api.get(API.notifications.my),
  getUnreadCount: () => api.get(API.notifications.unreadCount),
};
export const favoritesAPI = {
  getMy:  () => api.get(API.favorites.my),
  add:    (orgId: string) => api.post(API.favorites.toggle, { organizationId: orgId }),
  remove: (orgId: string) => api.delete(API.favorites.remove(orgId)),
};

// ── Sprint 10 — Customer & Provider Intelligence ─────────────────────────
export const customerIntelligenceAPI = {
  getIntelligence:    () => api.get('/customer/intelligence'),
  getRecommendations: () => api.get('/customer/recommendations'),
  getRepeatOptions:   () => api.get('/customer/repeat-options'),
  getFavorites:       () => api.get('/customer/favorites'),
  getHistorySummary:  () => api.get('/customer/history/summary'),
  repeatBooking:      (d: any) => api.post('/customer/repeat-booking', d),
};

export const providerIntelligenceAPI = {
  getIntelligence: () => api.get('/provider/intelligence'),
  getEarnings:     () => api.get('/provider/intelligence/earnings'),
  getDemand:       () => api.get('/provider/intelligence/demand'),
  getPerformance:  () => api.get('/provider/intelligence/performance'),
  getLostRevenue:  () => api.get('/provider/intelligence/lost-revenue'),
  getOpportunities:() => api.get('/provider/intelligence/opportunities'),
};

export const zonesAPI = {
  getLiveState: () => api.get('/zones/live-state'),
  getAll:       () => api.get('/zones'),
};

export default api;
export { API };
