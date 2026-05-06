import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AutoRequestsPage from './pages/AutoRequestsPage';
import PaymentsAndCreditsPage from './pages/PaymentsAndCreditsPage';
import UsersPage from './pages/UsersPage';
import OrganizationsPage from './pages/OrganizationsPage';
import MapPage from './pages/MapPage';
import BookingsPage from './pages/BookingsPage';
import QuotesPage from './pages/QuotesPage';
import PaymentsPage from './pages/PaymentsPage';
import DisputesPage from './pages/DisputesPage';
import ReviewsPage from './pages/ReviewsPage';
import SettingsPage from './pages/SettingsPage';
import ProviderInboxPage from './pages/ProviderInboxPage';
import CustomersPage from './pages/CustomersPage';
import ServicesPage from './pages/ServicesPage';
import LiveMonitorPage from './pages/LiveMonitorPage';
import ProvidersPage from './pages/ProvidersPage';
import ProviderDetailPage from './pages/ProviderDetailPage';
import GeoOpsPage from './pages/GeoOpsPage';
import MarketControlPage from './pages/MarketControlPage';
import AuditLogPage from './pages/AuditLogPage';
import NotificationsPage from './pages/NotificationsPage';
import ReportsPage from './pages/ReportsPage';
import FeatureFlagsPage from './pages/FeatureFlagsPage';
import SuggestionsPage from './pages/SuggestionsPage';
import ReputationPage from './pages/ReputationPage';
import SupplyQualityPage from './pages/SupplyQualityPage';
import ZoneControlPage from './pages/ZoneControlPage';
import EconomyControlPage from './pages/EconomyControlPage';
import DistributionControlPage from './pages/DistributionControlPage';
import IncidentControlPage from './pages/IncidentControlPage';
import DemandControlPage from './pages/DemandControlPage';
import SystemHealthPage from './pages/SystemHealthPage';
import SystemErrorsPage from './pages/SystemErrorsPage';
import ProviderLifecyclePage from './pages/ProviderLifecyclePage';
import OperatorPerformancePage from './pages/OperatorPerformancePage';
import SimulationPage from './pages/SimulationPage';
import RuleVisualizerPage from './pages/RuleVisualizerPage';
import PlaybooksPage from './pages/PlaybooksPage';
import ProviderBehaviorPage from './pages/ProviderBehaviorPage';
import RequestFlowPage from './pages/RequestFlowPage';
import GovernanceScorePage from './pages/GovernanceScorePage';
import DemandActionsPage from './pages/DemandActionsPage';
import RevenueExperimentsPage from './pages/RevenueExperimentsPage';
import AutomationControlPage from './pages/AutomationControlPage';
import AutoActionsPage from './pages/AutoActionsPage';
import ActionChainsPage from './pages/ActionChainsPage';
import ExecutionMonitorPage from './pages/ExecutionMonitorPage';
import ExecutionReplayPage from './pages/ExecutionReplayPage';
import ShadowModePage from './pages/ShadowModePage';
import IdempotencyPage from './pages/IdempotencyPage';
import ROITrackingPage from './pages/ROITrackingPage';
import UnifiedStatePage from './pages/UnifiedStatePage';
import FailsafePage from './pages/FailsafePage';
import FeedbackLoopPage from './pages/FeedbackLoopPage';
import DryRunPage from './pages/DryRunPage';
import AutoRulePerformancePage from './pages/AutoRulePerformancePage';
import AutomationDashboardPage from './pages/AutomationDashboardPage';
import MonetizationPage from './pages/MonetizationPage';
import StripePaymentsPage from './pages/StripePaymentsPage';
import StripeSettingsPage from './pages/StripeSettingsPage';
import SupportChatPage from './pages/SupportChatPage';
import ForecastDashboardPage from './pages/ForecastDashboardPage';
import RevenueDashboardPage from './pages/RevenueDashboardPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, token } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="auto-requests" element={<AutoRequestsPage />} />
        <Route path="auto-payments" element={<PaymentsAndCreditsPage />} />
        <Route path="live-monitor" element={<LiveMonitorPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="providers/:id" element={<ProviderDetailPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="geo-ops" element={<GeoOpsPage />} />
        <Route path="market-control" element={<MarketControlPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="disputes" element={<DisputesPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="provider-inbox" element={<ProviderInboxPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
        <Route path="feature-flags" element={<FeatureFlagsPage />} />
        <Route path="suggestions" element={<SuggestionsPage />} />
        <Route path="providers/:providerId/reputation" element={<ReputationPage />} />
        <Route path="supply-quality" element={<SupplyQualityPage />} />
        <Route path="zone-control" element={<ZoneControlPage />} />
        <Route path="economy" element={<EconomyControlPage />} />
        <Route path="distribution-control" element={<DistributionControlPage />} />
        <Route path="incidents" element={<IncidentControlPage />} />
        <Route path="demand-control" element={<DemandControlPage />} />
        <Route path="demand-actions" element={<DemandActionsPage />} />
        <Route path="governance-score" element={<GovernanceScorePage />} />
        <Route path="revenue-experiments" element={<RevenueExperimentsPage />} />
        <Route path="provider-behavior" element={<ProviderBehaviorPage />} />
        <Route path="request-flow" element={<RequestFlowPage />} />
        <Route path="system-health" element={<SystemHealthPage />} />
        <Route path="system/errors" element={<SystemErrorsPage />} />
        <Route path="providers/lifecycle" element={<ProviderLifecyclePage />} />
        <Route path="operators" element={<OperatorPerformancePage />} />
        <Route path="simulation" element={<SimulationPage />} />
        <Route path="rules/visualizer" element={<RuleVisualizerPage />} />
        <Route path="playbooks" element={<PlaybooksPage />} />
        <Route path="automation/dashboard" element={<AutomationDashboardPage />} />
        <Route path="automation/control" element={<AutomationControlPage />} />
        <Route path="automation/auto-actions" element={<AutoActionsPage />} />
        <Route path="automation/chains" element={<ActionChainsPage />} />
        <Route path="automation/engine" element={<ExecutionMonitorPage />} />
        <Route path="automation/replay" element={<ExecutionReplayPage />} />
        <Route path="automation/shadow" element={<ShadowModePage />} />
        <Route path="automation/idempotency" element={<IdempotencyPage />} />
        <Route path="automation/roi" element={<ROITrackingPage />} />
        <Route path="automation/unified-state" element={<UnifiedStatePage />} />
        <Route path="automation/failsafe" element={<FailsafePage />} />
        <Route path="automation/feedback" element={<FeedbackLoopPage />} />
        <Route path="automation/dry-run" element={<DryRunPage />} />
        <Route path="automation/performance" element={<AutoRulePerformancePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="monetization" element={<MonetizationPage />} />
        <Route path="billing/stripe" element={<StripePaymentsPage />} />
        <Route path="billing/stripe-settings" element={<StripeSettingsPage />} />
        <Route path="billing/support-chat" element={<SupportChatPage />} />
        <Route path="revenue" element={<RevenueDashboardPage />} />
        <Route path="forecast" element={<ForecastDashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
