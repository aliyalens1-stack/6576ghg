import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import MarketplaceHome from './pages/public/MarketplaceHome';
import InspectPage from './pages/public/InspectPage';
import SelectionRequestPage from './pages/public/SelectionRequestPage';
import ComparisonPage from './pages/public/ComparisonPage';
import { MyRequestsListPage, MyRequestDetailPage } from './pages/customer/MyRequestsPage';
import SearchPage from './pages/public/SearchPage';
import PackagesPage from './pages/customer/PackagesPage';
import PaymentSuccessPage from './pages/customer/PaymentSuccessPage';
import PayPalMockPage from './pages/customer/PayPalMockPage';
import LiveForecastMapPage from './pages/public/LiveForecastMapPage';
import ProviderPage from './pages/public/ProviderPage';
import ProviderBillingPage from './pages/provider/BillingPage';
import BookingDetailPage from './pages/public/BookingDetailPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import CustomerBookings from './pages/customer/CustomerBookings';
import CustomerHomePage from './pages/customer/HomePage';
import CustomerGarage from './pages/customer/CustomerGarage';
import CustomerProfile from './pages/customer/CustomerProfile';
import CustomerFavorites from './pages/customer/CustomerFavorites';
import ProviderDashboard from './pages/provider/ProviderDashboard';
import ProviderInbox from './pages/provider/ProviderInbox';
import ProviderEarnings from './pages/provider/ProviderEarnings';
import ProviderProfile from './pages/provider/ProviderProfile';
import ProviderCurrentJob from './pages/provider/ProviderCurrentJob';
import ProviderDemand from './pages/provider/ProviderDemand';
import ProviderOnboarding from './pages/provider/ProviderOnboarding';
import MarketplaceLayout from './components/MarketplaceLayout';

function ProtectedRoute({ roles }: { roles?: string[] }) {
  const { user, token } = useAuthStore();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (roles && roles.length > 0 && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'provider_owner' || user.role === 'provider_manager') return <Navigate to="/provider" replace />;
  return <Navigate to="/account/home" replace />;
}

export default function App() {
  const { checkAuth } = useAuthStore();
  useEffect(() => { checkAuth(); }, []);

  return (
    <Routes>
      {/* Single product shell — all main routes share AppShell (header + footer) */}
      <Route element={<MarketplaceLayout />}>
        {/* Public */}
        <Route path="/" element={<MarketplaceHome />} />
        <Route path="/inspect" element={<InspectPage />} />
        <Route path="/selection-request" element={<SelectionRequestPage />} />
        <Route path="/comparison" element={<ComparisonPage />} />
        <Route path="/dashboard/requests" element={<MyRequestsListPage />} />
        <Route path="/dashboard/requests/:id" element={<MyRequestDetailPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/packages/success" element={<PaymentSuccessPage />} />
        <Route path="/packages/paypal-mock" element={<PayPalMockPage />} />
        <Route path="/zones" element={<LiveForecastMapPage />} />
        <Route path="/provider/:slug" element={<ProviderPage />} />
        <Route path="/booking/:id" element={<BookingDetailPage />} />

        {/* Customer area — same shell, just different content */}
        <Route element={<ProtectedRoute roles={['customer']} />}>
          <Route path="/account">
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<CustomerHomePage />} />
            <Route path="bookings" element={<CustomerBookings />} />
            <Route path="garage" element={<CustomerGarage />} />
            <Route path="favorites" element={<CustomerFavorites />} />
            <Route path="profile" element={<CustomerProfile />} />
          </Route>
        </Route>

        {/* Provider area — same shell */}
        <Route element={<ProtectedRoute roles={['provider_owner', 'provider_manager', 'admin']} />}>
          <Route path="/provider">
            <Route index element={<ProviderDashboard />} />
            <Route path="inbox" element={<ProviderInbox />} />
            <Route path="current-job" element={<ProviderCurrentJob />} />
            <Route path="earnings" element={<ProviderEarnings />} />
            <Route path="demand" element={<ProviderDemand />} />
            <Route path="profile" element={<ProviderProfile />} />
            <Route path="billing" element={<ProviderBillingPage />} />
          </Route>
        </Route>
      </Route>

      {/* Onboarding wizard — public, no auth, full-screen (own layout) */}
      <Route path="/provider/onboarding" element={<ProviderOnboarding />} />
      <Route path="/provider-onboarding" element={<ProviderOnboarding />} />

      {/* Auth pages — no shell (full-screen) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/app" element={<RoleRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
