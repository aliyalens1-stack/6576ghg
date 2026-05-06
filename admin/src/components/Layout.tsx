import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Building2, Calendar, CreditCard, 
  MessageSquare, Star, FileText, Settings, LogOut, MapPin, Inbox,
  Radio, Package, UserCircle, Globe, Cpu, History, Bell, BarChart3, Search, Zap, AlertTriangle, Wifi, WifiOff, Flag, Lightbulb, Shield,
  Activity, DollarSign, Sliders, TrendingUp, UserCog, Sparkles, GitBranch, BookOpen,
  Bot, Link2, RotateCcw, EyeOff, Key, ArrowUpDown, FlaskConical, Gauge, SlidersHorizontal, Brain, Headphones, ClipboardCheck, CreditCard
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import GlobalSearchModal from './GlobalSearchModal';
import QuickActionsPanel from './QuickActionsPanel';
import { useRealtimeConnection, useAlerts } from '../hooks/useRealtime';

const navGroups = [
  {
    label: 'AUTO 2.0 · CORE',
    items: [
      { to: '/auto-requests', icon: ClipboardCheck, label: '🚗 Auto Requests' },
      { to: '/auto-payments', icon: CreditCard, label: '💳 Payments & Credits' },
    ]
  },
  {
    label: 'CORE',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/live-monitor', icon: Radio, label: 'Live Monitor' },
      { to: '/geo-ops', icon: Globe, label: 'Geo Ops' },
    ]
  },
  {
    label: 'GOVERNANCE',
    items: [
      { to: '/forecast', icon: Brain, label: '🧠 Forecast (ML)' },
      { to: '/supply-quality', icon: Shield, label: 'Supply Quality' },
      { to: '/zone-control', icon: MapPin, label: 'Zone Control' },
      { to: '/economy', icon: DollarSign, label: 'Economy' },
      { to: '/distribution-control', icon: Sliders, label: 'Distribution' },
      { to: '/demand-control', icon: TrendingUp, label: 'Demand Control' },
      { to: '/demand-actions', icon: Zap, label: 'Demand Actions' },
      { to: '/provider-behavior', icon: UserCog, label: 'Provider Behavior' },
      { to: '/request-flow', icon: Sliders, label: 'Request Flow' },
      { to: '/governance-score', icon: Activity, label: 'Governance Score' },
      { to: '/revenue-experiments', icon: Sparkles, label: 'Revenue A/B' },
      { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
      { to: '/system-health', icon: Activity, label: 'System Health' },
      { to: '/system/errors', icon: AlertTriangle, label: 'System Errors' },
      { to: '/providers/lifecycle', icon: UserCog, label: 'Lifecycle' },
      { to: '/operators', icon: Users, label: 'Operators' },
      { to: '/simulation', icon: Sparkles, label: 'Simulation' },
      { to: '/rules/visualizer', icon: GitBranch, label: 'Rules Visualizer' },
      { to: '/playbooks', icon: BookOpen, label: 'Playbooks' },
    ]
  },
  {
    label: 'AUTOMATION',
    items: [
      { to: '/automation/dashboard', icon: Gauge, label: 'Auto Dashboard' },
      { to: '/automation/control', icon: SlidersHorizontal, label: 'Automation Control' },
      { to: '/automation/auto-actions', icon: Bot, label: 'Auto Actions' },
      { to: '/automation/chains', icon: Link2, label: 'Action Chains' },
      { to: '/automation/engine', icon: Activity, label: 'Execution Monitor' },
      { to: '/automation/replay', icon: RotateCcw, label: 'Execution Replay' },
      { to: '/automation/shadow', icon: EyeOff, label: 'Shadow Mode' },
      { to: '/automation/idempotency', icon: Key, label: 'Idempotency' },
      { to: '/automation/roi', icon: DollarSign, label: 'ROI Tracking' },
      { to: '/automation/unified-state', icon: ArrowUpDown, label: 'Unified State' },
      { to: '/automation/failsafe', icon: Shield, label: 'Auto Failsafe' },
      { to: '/automation/feedback', icon: MessageSquare, label: 'Feedback Loop' },
      { to: '/automation/dry-run', icon: FlaskConical, label: 'Dry Run' },
      { to: '/automation/performance', icon: TrendingUp, label: 'Rule Performance' },
    ]
  },
  {
    label: 'OPERATIONS',
    items: [
      { to: '/market-control', icon: Cpu, label: 'Market Control' },
      { to: '/providers', icon: Building2, label: 'Мастера' },
      { to: '/provider-inbox', icon: Inbox, label: 'Provider Inbox' },
      { to: '/bookings', icon: Calendar, label: 'Бронирования' },
      { to: '/quotes', icon: FileText, label: 'Заявки' },
      { to: '/customers', icon: UserCircle, label: 'Клиенты' },
    ]
  },
  {
    label: 'CONTROL',
    items: [
      { to: '/feature-flags', icon: Flag, label: 'Feature Flags' },
      { to: '/suggestions', icon: Lightbulb, label: 'Smart Actions' },
      { to: '/notifications', icon: Bell, label: 'Уведомления' },
    ]
  },
  {
    label: 'ANALYTICS',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Отчёты' },
      { to: '/audit-log', icon: History, label: 'Audit Log' },
    ]
  },
  {
    label: 'FINANCE',
    items: [
      { to: '/payments', icon: CreditCard, label: 'Платежи' },
      { to: '/disputes', icon: MessageSquare, label: 'Споры' },
      { to: '/reviews', icon: Star, label: 'Отзывы' },
      { to: '/monetization', icon: TrendingUp, label: '💰 Монетизация' },
      { to: '/billing/stripe', icon: CreditCard, label: '⚡ Stripe Setup' },
      { to: '/billing/stripe-settings', icon: Key, label: '🔐 Stripe Settings' },
      { to: '/billing/support-chat', icon: Headphones, label: '🎧 Support Chat' },
      { to: '/revenue', icon: TrendingUp, label: '💵 Revenue Dashboard' },
    ]
  },
  {
    label: 'SYSTEM',
    items: [
      { to: '/users', icon: Users, label: 'Пользователи' },
      { to: '/organizations', icon: Building2, label: 'Организации' },
      { to: '/services', icon: Package, label: 'Услуги' },
      { to: '/map', icon: MapPin, label: 'Карта' },
      { to: '/settings', icon: Settings, label: 'Настройки' },
    ]
  },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const { isConnected } = useRealtimeConnection();
  const { alerts } = useAlerts();
  
  const criticalAlerts = alerts.filter(a => a.type === 'critical').length;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setActionsOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setActionsOpen(true);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/api/admin-panel/logo.png" alt="AutoSearch" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
              <span className="text-[10px] font-bold text-slate-500 tracking-widest">CONTROL CENTER</span>
            </div>
            {/* Connection Status */}
            <div className={`p-1.5 rounded-full ${isConnected ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              {isConnected ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
            </div>
          </div>
        </div>
        
        {/* Search & Quick Actions */}
        <div className="p-3 space-y-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-400 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left text-sm">Поиск...</span>
            <kbd className="px-1.5 py-0.5 bg-slate-600 rounded text-xs">⌘K</kbd>
          </button>
          <button
            onClick={() => setActionsOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-amber-400 transition-colors"
          >
            <Zap className="w-4 h-4" />
            <span className="flex-1 text-left text-sm font-medium">Quick Actions</span>
            <kbd className="px-1.5 py-0.5 bg-amber-500/20 rounded text-xs">⌘J</kbd>
          </button>
        </div>

        {/* Critical Alerts Badge */}
        {criticalAlerts > 0 && (
          <div className="mx-3 mb-2 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">{criticalAlerts} Critical Alerts</span>
            </div>
          </div>
        )}
        
        <nav className="flex-1 p-2 space-y-4 overflow-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                        isActive 
                          ? 'bg-primary text-white' 
                          : 'text-slate-300 hover:bg-slate-700'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-medium">
                {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName || user?.email}
              </p>
              <p className="text-xs text-slate-400">Оператор</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      
      {/* Quick Actions Panel */}
      <QuickActionsPanel isOpen={actionsOpen} onClose={() => setActionsOpen(false)} />
    </div>
  );
}
