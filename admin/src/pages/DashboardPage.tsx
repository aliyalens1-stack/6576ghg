import { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { 
  Users, Building2, Calendar, CreditCard, Star, FileText, TrendingUp, Clock,
  AlertTriangle, Activity, ArrowRight, RefreshCw, Bell, MapPin, DollarSign,
  CheckCircle, XCircle, MessageSquare, Zap, Eye, Timer, Target, AlertCircle, Wifi, WifiOff
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useRealtimeConnection, useLiveFeed, useAlerts, useRealtimeEvent } from '../hooks/useRealtime';

interface DashboardStats {
  users: { total: number; today: number; active: number };
  organizations: { total: number; active: number; pending: number; suspended: number };
  bookings: { total: number; today: number; inProgress: number; completed: number; cancelled: number };
  quotes: { total: number; today: number; noResponse: number; converted: number };
  reviews: { total: number; today: number; avgRating: number };
  payments: { total: number; totalAmount: number; platformFees: number; pending: number; failed: number };
  disputes: { total: number; open: number; urgent: number; overdue: number };
}

interface MarketMetrics {
  today: { quotes: number; bookings: number; conversionRate: number; gmv: number };
  week: { quotes: number; avgQuotesPerDay: number; gmv: number };
  providers: { active: number; responseRate: number; avgResponseTime: number };
  response: { avgTimeMinutes: number; health: string; p95Minutes: number };
  conversion: { requestToBooking: number; bookingToCompleted: number; repeatRate: number };
}

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  count?: number;
  action?: string;
  actionUrl?: string;
  createdAt: string;
}

interface LiveEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  entityId?: string;
  entityType?: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

const StatCard = ({ icon: Icon, label, value, subValue, trend, color, onClick }: any) => (
  <div 
    className={`bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors ${onClick ? 'cursor-pointer' : ''}`}
    onClick={onClick}
  >
    <div className="flex items-center justify-between mb-2">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      {trend && (
        <span className={`text-xs font-medium ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <p className="text-2xl font-bold text-white">{value}</p>
    <p className="text-sm text-slate-400">{label}</p>
    {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
  </div>
);

const AlertCard = ({ alert, onAction }: { alert: Alert; onAction?: (action: string, alertId: string) => void }) => {
  const colors = {
    critical: 'border-red-500/50 bg-red-500/10',
    warning: 'border-yellow-500/50 bg-yellow-500/10',
    info: 'border-blue-500/50 bg-blue-500/10',
  };
  const icons = {
    critical: AlertTriangle,
    warning: AlertCircle,
    info: Bell,
  };
  const Icon = icons[alert.type];
  
  // Define quick actions based on alert type
  const getAlertActions = (alert: Alert) => {
    if (alert.title.includes('supply') || alert.title.includes('мастер')) {
      return [
        { label: 'Boost Supply', action: 'boost_supply', color: 'bg-green-500/20 text-green-400 hover:bg-green-500/30' },
        { label: 'Send Push', action: 'send_push', color: 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30' },
      ];
    }
    if (alert.title.includes('SLA') || alert.title.includes('overdue')) {
      return [
        { label: 'Reassign', action: 'reassign', color: 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30' },
        { label: 'Escalate', action: 'escalate', color: 'bg-red-500/20 text-red-400 hover:bg-red-500/30' },
      ];
    }
    if (alert.title.includes('спор') || alert.title.includes('dispute')) {
      return [
        { label: 'View', action: 'view_dispute', color: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' },
      ];
    }
    return [];
  };
  
  const actions = getAlertActions(alert);
  
  return (
    <div className={`p-3 rounded-lg border ${colors[alert.type]}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={alert.type === 'critical' ? 'text-red-400' : alert.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-medium">{alert.title}</p>
            {alert.count && (
              <span className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-white">{alert.count}</span>
            )}
          </div>
          <p className="text-slate-400 text-xs mt-0.5">{alert.description}</p>
        </div>
      </div>
      
      {/* Quick Action Buttons */}
      {actions.length > 0 && (
        <div className="flex gap-2 mt-3 ml-7">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction?.(action.action, alert.id)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${action.color}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const LiveEventItem = ({ event }: { event: LiveEvent }) => {
  const typeIcons: Record<string, any> = {
    quote_created: FileText,
    quote_response: MessageSquare,
    booking_confirmed: Calendar,
    booking_completed: CheckCircle,
    booking_cancelled: XCircle,
    payment_completed: CreditCard,
    payment_failed: AlertTriangle,
    dispute_opened: AlertCircle,
    review_posted: Star,
    provider_suspended: AlertTriangle,
    provider_verified: CheckCircle,
  };
  const typeColors: Record<string, string> = {
    quote_created: 'text-blue-400',
    quote_response: 'text-cyan-400',
    booking_confirmed: 'text-green-400',
    booking_completed: 'text-emerald-400',
    booking_cancelled: 'text-red-400',
    payment_completed: 'text-green-400',
    payment_failed: 'text-red-400',
    dispute_opened: 'text-orange-400',
    review_posted: 'text-yellow-400',
    provider_suspended: 'text-red-400',
    provider_verified: 'text-green-400',
  };
  
  const Icon = typeIcons[event.type] || Activity;
  const color = typeColors[event.type] || 'text-slate-400';
  
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0">
      <Icon size={16} className={color} />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm">{event.title}</p>
        <p className="text-slate-500 text-xs truncate">{event.description}</p>
      </div>
      <span className="text-slate-500 text-xs whitespace-nowrap">
        {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true, locale: ru })}
      </span>
    </div>
  );
};

const HealthIndicator = ({ label, value, status }: { label: string; value: string; status: 'good' | 'warning' | 'critical' }) => {
  const colors = {
    good: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
  };
  
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-slate-400 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-white text-sm font-medium">{value}</span>
        <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      </div>
    </div>
  );
};

// Helper functions for event formatting
const getEventTitle = (type: string, data: any): string => {
  const titles: Record<string, string> = {
    'request.created': 'Новая заявка',
    'request.updated': 'Заявка обновлена',
    'request.expired': 'Заявка истекла',
    'request.escalated': 'Заявка эскалирована',
    'provider.responded': 'Мастер ответил',
    'provider.online': 'Мастер онлайн',
    'provider.offline': 'Мастер оффлайн',
    'provider.location.updated': 'Локация обновлена',
    'provider.status.changed': 'Статус мастера изменён',
    'provider.verified': 'Мастер верифицирован',
    'provider.suspended': 'Мастер приостановлен',
    'booking.created': 'Новое бронирование',
    'booking.confirmed': 'Бронирование подтверждено',
    'booking.started': 'Работа начата',
    'booking.completed': 'Заказ завершён',
    'booking.cancelled': 'Бронирование отменено',
    'payment.success': 'Платёж успешен',
    'payment.failed': 'Платёж не прошёл',
    'refund.created': 'Возврат создан',
    'dispute.opened': 'Открыт спор',
    'dispute.updated': 'Спор обновлён',
    'dispute.resolved': 'Спор решён',
    'review.posted': 'Новый отзыв',
    'alert.created': 'Системный алерт',
    'sla.warning': 'SLA предупреждение',
    'sla.breach': 'SLA нарушен',
  };
  return titles[type] || type;
};

const getEventDescription = (type: string, data: any): string => {
  if (!data) return '';
  
  switch (type) {
    case 'request.created':
      return `${data.serviceType || 'Услуга'} • ${data.city || ''}`;
    case 'provider.responded':
      return `${data.providerName || 'Мастер'} предложил ₴${data.price || 0}`;
    case 'booking.created':
    case 'booking.confirmed':
      return `${data.providerName || 'Мастер'} • ₴${data.totalPrice || 0}`;
    case 'booking.completed':
      return `Завершено • ₴${data.totalPrice || 0}`;
    case 'payment.success':
      return `₴${data.amount || 0}`;
    case 'payment.failed':
      return `₴${data.amount || 0} - ${data.error || 'Ошибка'}`;
    case 'dispute.opened':
      return `${data.category || ''} • ₴${data.amountAtRisk || 0}`;
    case 'review.posted':
      return `${data.rating}★ - ${data.providerName || ''}`;
    case 'provider.online':
    case 'provider.offline':
      return data.name || 'Мастер';
    case 'provider.location.updated':
      return `${data.name || 'Мастер'} обновил позицию`;
    default:
      return JSON.stringify(data).slice(0, 50);
  }
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [metrics, setMetrics] = useState<MarketMetrics | null>(null);
  const [staticAlerts, setStaticAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time connection status
  const { connected, reconnect } = useRealtimeConnection();
  
  // Real-time live feed
  const { events: liveEvents } = useLiveFeed(20);
  
  // Real-time alerts
  const { alerts: realtimeAlerts } = useAlerts();

  // Subscribe to real-time stats updates
  useRealtimeEvent('request.created', () => {
    // Increment quotes count
    setStats(prev => prev ? {
      ...prev,
      quotes: { ...prev.quotes, today: (prev.quotes?.today || 0) + 1 }
    } : prev);
  });

  useRealtimeEvent('booking.created', () => {
    setStats(prev => prev ? {
      ...prev,
      bookings: { ...prev.bookings, today: (prev.bookings?.today || 0) + 1 }
    } : prev);
  });

  useRealtimeEvent('dispute.opened', () => {
    setStats(prev => prev ? {
      ...prev,
      disputes: { ...prev.disputes, open: (prev.disputes?.open || 0) + 1 }
    } : prev);
  });

  // Combine static and realtime alerts
  const alerts = [...realtimeAlerts.map((a, i) => ({
    id: `rt-${i}`,
    type: a.type || 'warning' as 'critical' | 'warning' | 'info',
    title: a.title || a.data?.title || 'Alert',
    description: a.description || a.data?.description || '',
    createdAt: a.timestamp || new Date().toISOString(),
  })), ...staticAlerts];

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const [statsRes, metricsRes] = await Promise.all([
        adminAPI.getDashboard(),
        adminAPI.getMarketMetrics(),
      ]);
      
      setStats(statsRes.data);
      setMetrics(metricsRes.data);
      
      // Generate alerts based on data
      const newAlerts: Alert[] = [];
      
      if (statsRes.data.quotes?.noResponse > 0) {
        newAlerts.push({
          id: '1',
          type: 'critical',
          title: 'Заявки без ответа',
          description: `${statsRes.data.quotes?.noResponse} заявок ожидают > 10 мин`,
          count: statsRes.data.quotes?.noResponse,
          action: 'Открыть',
          createdAt: new Date().toISOString(),
        });
      }
      
      if (statsRes.data.disputes?.open > 0) {
        newAlerts.push({
          id: '2',
          type: statsRes.data.disputes?.urgent > 0 ? 'critical' : 'warning',
          title: 'Открытые споры',
          description: `${statsRes.data.disputes?.open} споров требуют внимания`,
          count: statsRes.data.disputes?.open,
          action: 'Разобрать',
          createdAt: new Date().toISOString(),
        });
      }
      
      if (statsRes.data.payments?.failed > 0) {
        newAlerts.push({
          id: '3',
          type: 'warning',
          title: 'Неуспешные платежи',
          description: `${statsRes.data.payments?.failed} платежей не прошли`,
          count: statsRes.data.payments?.failed,
          action: 'Проверить',
          createdAt: new Date().toISOString(),
        });
      }
      
      if (statsRes.data.organizations?.pending > 0) {
        newAlerts.push({
          id: '4',
          type: 'info',
          title: 'Мастера на проверке',
          description: `${statsRes.data.organizations?.pending} ожидают верификации`,
          count: statsRes.data.organizations?.pending,
          action: 'Проверить',
          createdAt: new Date().toISOString(),
        });
      }
      
      setStaticAlerts(newAlerts);
      
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const marketHealth = metrics?.response?.health === 'good' ? 'good' : 
                       metrics?.response?.avgTimeMinutes && metrics.response.avgTimeMinutes > 15 ? 'critical' : 'warning';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Control Tower</h1>
          <p className="text-slate-400 text-sm">
            Операционный центр платформы • {format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: ru })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Real-time connection status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${connected ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {connected ? (
              <>
                <Wifi size={16} className="text-green-400" />
                <span className="text-green-400 text-sm">Live</span>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </>
            ) : (
              <>
                <WifiOff size={16} className="text-red-400" />
                <span className="text-red-400 text-sm">Offline</span>
                <button onClick={reconnect} className="text-xs text-red-300 hover:underline">Reconnect</button>
              </>
            )}
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Обновить
          </button>
        </div>
      </div>

      {/* Critical Alerts */}
      {alerts.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-yellow-400" />
            <h2 className="text-white font-semibold">Требует внимания</h2>
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">{alerts.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <StatCard icon={Users} label="Активные клиенты" value={stats?.users?.active || 0} subValue={`+${stats?.users?.today || 0} сегодня`} color="bg-blue-500" />
        <StatCard icon={Building2} label="Активные мастера" value={stats?.organizations?.active || 0} subValue={`${stats?.organizations?.pending || 0} на проверке`} color="bg-green-500" />
        <StatCard icon={FileText} label="Заявки сегодня" value={stats?.quotes?.today || 0} subValue={`${stats?.quotes?.noResponse || 0} без ответа`} color="bg-orange-500" />
        <StatCard icon={Calendar} label="Бронирования" value={stats?.bookings?.today || 0} subValue={`${stats?.bookings?.inProgress || 0} в работе`} color="bg-purple-500" />
        <StatCard icon={DollarSign} label="GMV сегодня" value={`₴${(metrics?.today?.gmv || 0).toLocaleString()}`} color="bg-emerald-500" />
        <StatCard icon={Target} label="Конверсия" value={`${metrics?.today?.conversionRate || 0}%`} subValue="заявки → брони" color="bg-cyan-500" />
        <StatCard icon={Timer} label="Ответ мастеров" value={`${metrics?.response?.avgTimeMinutes || 0} мин`} color="bg-pink-500" />
        <StatCard icon={MessageSquare} label="Открытые споры" value={stats?.disputes?.open || 0} subValue={`${stats?.disputes?.urgent || 0} срочных`} color="bg-red-500" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={18} className={connected ? "text-green-400" : "text-slate-400"} />
              <h2 className="text-white font-semibold">Live поток событий</h2>
              {connected && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
            </div>
            <span className="text-slate-500 text-sm">
              {liveEvents.length > 0 ? `${liveEvents.length} событий` : 'Ожидание событий...'}
            </span>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {liveEvents.length === 0 ? (
              <div className="text-center py-8">
                <Activity size={32} className="text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  {connected ? 'Ожидание событий...' : 'Подключение к real-time серверу...'}
                </p>
              </div>
            ) : (
              liveEvents.slice(0, 10).map((event, idx) => (
                <LiveEventItem 
                  key={`${event.type}-${idx}`} 
                  event={{
                    id: `${idx}`,
                    type: event.type?.replace('.', '_') || 'unknown',
                    title: getEventTitle(event.type, event.data),
                    description: getEventDescription(event.type, event.data),
                    createdAt: event.timestamp || new Date().toISOString(),
                  }} 
                />
              ))
            )}
          </div>
          {liveEvents.length > 10 && (
            <button className="w-full mt-4 py-2 text-primary text-sm hover:bg-slate-700/50 rounded-lg transition-colors">
              Показать все события ({liveEvents.length}) <ArrowRight size={14} className="inline ml-1" />
            </button>
          )}
        </div>

        {/* Platform Health */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-yellow-400" />
            <h2 className="text-white font-semibold">Здоровье платформы</h2>
          </div>
          <div className="space-y-1 divide-y divide-slate-700/50">
            <HealthIndicator 
              label="Рынок" 
              value={marketHealth === 'good' ? 'Норма' : marketHealth === 'warning' ? 'Внимание' : 'Критично'} 
              status={marketHealth as any} 
            />
            <HealthIndicator 
              label="Supply/Demand баланс" 
              value={`${metrics?.providers?.active || 0} активных`}
              status={metrics?.providers?.active && metrics.providers.active > 0 ? 'good' : 'warning'} 
            />
            <HealthIndicator 
              label="Время ответа" 
              value={`${metrics?.response?.avgTimeMinutes || 0} мин`}
              status={metrics?.response?.avgTimeMinutes && metrics.response.avgTimeMinutes <= 5 ? 'good' : metrics?.response?.avgTimeMinutes && metrics.response.avgTimeMinutes <= 15 ? 'warning' : 'critical'} 
            />
            <HealthIndicator 
              label="Конверсия в booking" 
              value={`${metrics?.conversion?.requestToBooking || 0}%`}
              status={metrics?.conversion?.requestToBooking && metrics.conversion.requestToBooking >= 30 ? 'good' : metrics?.conversion?.requestToBooking && metrics.conversion.requestToBooking >= 15 ? 'warning' : 'critical'} 
            />
            <HealthIndicator 
              label="Завершение bookings" 
              value={`${metrics?.conversion?.bookingToCompleted || 0}%`}
              status={metrics?.conversion?.bookingToCompleted && metrics.conversion.bookingToCompleted >= 90 ? 'good' : metrics?.conversion?.bookingToCompleted && metrics.conversion.bookingToCompleted >= 70 ? 'warning' : 'critical'} 
            />
            <HealthIndicator 
              label="Repeat rate" 
              value={`${metrics?.conversion?.repeatRate || 0}%`}
              status={metrics?.conversion?.repeatRate && metrics.conversion.repeatRate >= 20 ? 'good' : 'warning'} 
            />
          </div>
        </div>
      </div>

      {/* Revenue & Conversion Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={18} className="text-green-400" />
            <h2 className="text-white font-semibold">Доходы платформы</h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-slate-400 text-sm">Общий GMV</p>
              <p className="text-2xl font-bold text-white">₴{(stats?.payments?.totalAmount || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Комиссия платформы</p>
              <p className="text-2xl font-bold text-green-400">₴{(stats?.payments?.platformFees || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">GMV за неделю</p>
              <p className="text-2xl font-bold text-white">₴{(metrics?.week?.gmv || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500">~{metrics?.week?.avgQuotesPerDay || 0} заявок/день</p>
            </div>
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-cyan-400" />
            <h2 className="text-white font-semibold">Воронка конверсии</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Заявки → Ответы</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${metrics?.providers?.responseRate || 0}%` }} />
                </div>
                <span className="text-white text-sm font-medium w-12 text-right">{metrics?.providers?.responseRate || 0}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Заявки → Бронирования</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${metrics?.conversion?.requestToBooking || 0}%` }} />
                </div>
                <span className="text-white text-sm font-medium w-12 text-right">{metrics?.conversion?.requestToBooking || 0}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Бронирования → Завершены</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${metrics?.conversion?.bookingToCompleted || 0}%` }} />
                </div>
                <span className="text-white text-sm font-medium w-12 text-right">{metrics?.conversion?.bookingToCompleted || 0}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Повторные клиенты</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${metrics?.conversion?.repeatRate || 0}%` }} />
                </div>
                <span className="text-white text-sm font-medium w-12 text-right">{metrics?.conversion?.repeatRate || 0}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">Всего пользователей</p>
          <p className="text-xl font-bold text-white">{stats?.users?.total || 0}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">Всего мастеров</p>
          <p className="text-xl font-bold text-white">{stats?.organizations?.total || 0}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">Всего бронирований</p>
          <p className="text-xl font-bold text-white">{stats?.bookings?.total || 0}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">Всего заявок</p>
          <p className="text-xl font-bold text-white">{stats?.quotes?.total || 0}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">Всего отзывов</p>
          <p className="text-xl font-bold text-white">{stats?.reviews?.total || 0}</p>
          <p className="text-xs text-yellow-400">★ {stats?.reviews?.avgRating?.toFixed(1) || '—'}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">Всего платежей</p>
          <p className="text-xl font-bold text-white">{stats?.payments?.total || 0}</p>
          <p className="text-xs text-red-400">{stats?.payments?.failed || 0} неуспешных</p>
        </div>
      </div>
    </div>
  );
}
