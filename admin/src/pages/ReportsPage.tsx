import { useState, useEffect } from 'react';
import { BarChart3, Download, TrendingUp, DollarSign, Users, Calendar, Filter, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { adminAPI } from '../services/api';

interface ReportData {
  type: string;
  summary?: any;
  data?: any[];
  funnel?: any;
  rates?: any;
  metrics?: any;
  byStatus?: Record<string, number>;
  byTier?: Record<string, number>;
}

const COLORS = ['#6366f1', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<'revenue' | 'bookings' | 'providers' | 'conversion' | 'kpis'>('kpis');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [groupBy, setGroupBy] = useState('day');
  const [exporting, setExporting] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getReport(activeReport, {
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
        groupBy: activeReport === 'revenue' ? groupBy : undefined,
      });
      setReportData(res.data);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeReport, dateRange, groupBy]);

  const handleExport = async (entity: string) => {
    setExporting(true);
    try {
      const res = await adminAPI.exportData(entity);
      const blob = new Blob([res.data.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entity}_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const reports = [
    { id: 'kpis', label: 'KPIs', icon: TrendingUp },
    { id: 'revenue', label: 'Доходы', icon: DollarSign },
    { id: 'bookings', label: 'Бронирования', icon: Calendar },
    { id: 'providers', label: 'Мастера', icon: Users },
    { id: 'conversion', label: 'Конверсия', icon: BarChart3 },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <BarChart3 className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Отчёты и аналитика</h1>
            <p className="text-sm text-slate-400">Метрики, KPI, экспорт данных</p>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <select
            onChange={(e) => e.target.value && handleExport(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
            disabled={exporting}
          >
            <option value="">Экспорт CSV...</option>
            <option value="users">Пользователи</option>
            <option value="organizations">Организации</option>
            <option value="bookings">Бронирования</option>
            <option value="payments">Платежи</option>
            <option value="quotes">Заявки</option>
          </select>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 mb-6">
        {reports.map((report) => (
          <button
            key={report.id}
            onClick={() => setActiveReport(report.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeReport === report.id
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <report.icon className="w-4 h-4" />
            {report.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-sm">Период:</span>
          </div>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
          />
          <span className="text-slate-500">—</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
          />
          
          {activeReport === 'revenue' && (
            <>
              <div className="w-px h-6 bg-slate-600" />
              <span className="text-slate-400 text-sm">Группировка:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
              >
                <option value="day">По дням</option>
                <option value="week">По неделям</option>
                <option value="month">По месяцам</option>
              </select>
            </>
          )}

          <button
            onClick={loadReport}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
          <p className="text-slate-400 mt-2">Загрузка отчёта...</p>
        </div>
      ) : reportData ? (
        <div className="space-y-6">
          {/* KPIs Report */}
          {activeReport === 'kpis' && reportData.metrics && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <DollarSign className="w-4 h-4" />
                  GMV
                </div>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(reportData.metrics.gmv || 0)}
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <TrendingUp className="w-4 h-4" />
                  Выручка платформы
                </div>
                <div className="text-3xl font-bold text-emerald-400">
                  {formatCurrency(reportData.metrics.platformRevenue || 0)}
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Calendar className="w-4 h-4" />
                  Бронирования
                </div>
                <div className="text-3xl font-bold text-white">
                  {reportData.metrics.totalBookings}
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  Завершено: {reportData.metrics.completedBookings} ({reportData.metrics.completionRate}%)
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Users className="w-4 h-4" />
                  Средний чек
                </div>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(parseFloat(reportData.metrics.avgBookingValue) || 0)}
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  Время ответа: {reportData.metrics.avgResponseTime}
                </div>
              </div>
            </div>
          )}

          {/* Revenue Report */}
          {activeReport === 'revenue' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
              {reportData.data && reportData.data.length > 0 ? (
                <>
                  <h3 className="text-lg font-semibold text-white mb-4">Динамика доходов</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportData.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="period" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                          formatter={(value: number) => formatCurrency(value)}
                        />
                        <Line type="monotone" dataKey="gmv" stroke="#6366f1" strokeWidth={2} name="GMV" />
                        <Line type="monotone" dataKey="platformFees" stroke="#22c55e" strokeWidth={2} name="Комиссия" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : reportData.summary ? (
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">GMV</div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(reportData.summary.gmv)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">Комиссия</div>
                    <div className="text-2xl font-bold text-emerald-400">{formatCurrency(reportData.summary.platformFees)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">Транзакций</div>
                    <div className="text-2xl font-bold text-white">{reportData.summary.count}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">Средний чек</div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(reportData.summary.avgAmount)}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Bookings Report */}
          {activeReport === 'bookings' && reportData.summary && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Сводка</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Всего бронирований</span>
                    <span className="text-2xl font-bold text-white">{reportData.summary.total}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Завершено</span>
                    <span className="text-xl font-bold text-emerald-400">{reportData.summary.completed}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Отменено</span>
                    <span className="text-xl font-bold text-red-400">{reportData.summary.cancelled}</span>
                  </div>
                  <div className="h-px bg-slate-700" />
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Completion Rate</span>
                    <span className="text-lg font-bold text-white">{reportData.summary.completionRate}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Cancel Rate</span>
                    <span className="text-lg font-bold text-white">{reportData.summary.cancellationRate}%</span>
                  </div>
                </div>
              </div>
              
              {reportData.byStatus && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">По статусам</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(reportData.byStatus).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {Object.keys(reportData.byStatus).map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Providers Report */}
          {activeReport === 'providers' && reportData.summary && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Сводка по мастерам</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Всего</span>
                    <span className="text-2xl font-bold text-white">{reportData.summary.total}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Активных</span>
                    <span className="text-xl font-bold text-emerald-400">{reportData.summary.active}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Верифицировано</span>
                    <span className="text-xl font-bold text-blue-400">{reportData.summary.verified}</span>
                  </div>
                  <div className="h-px bg-slate-700" />
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Active Rate</span>
                    <span className="text-lg font-bold text-white">{reportData.summary.activeRate}%</span>
                  </div>
                </div>
              </div>
              
              {reportData.byTier && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">По тирам</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Object.entries(reportData.byTier).map(([name, value]) => ({ name, value }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                        <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conversion Report */}
          {activeReport === 'conversion' && reportData.funnel && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Воронка конверсии</h3>
                <div className="space-y-4">
                  <div className="relative">
                    <div className="flex justify-between items-center p-3 bg-indigo-500/20 rounded-lg">
                      <span className="text-indigo-300">Заявки</span>
                      <span className="text-xl font-bold text-white">{reportData.funnel.quotes}</span>
                    </div>
                  </div>
                  <div className="text-center text-slate-500">↓ {reportData.rates?.responseRate}%</div>
                  <div className="relative">
                    <div className="flex justify-between items-center p-3 bg-cyan-500/20 rounded-lg">
                      <span className="text-cyan-300">С ответами</span>
                      <span className="text-xl font-bold text-white">{reportData.funnel.quotesWithResponses}</span>
                    </div>
                  </div>
                  <div className="text-center text-slate-500">↓ {reportData.rates?.conversionRate}%</div>
                  <div className="relative">
                    <div className="flex justify-between items-center p-3 bg-emerald-500/20 rounded-lg">
                      <span className="text-emerald-300">Бронирования</span>
                      <span className="text-xl font-bold text-white">{reportData.funnel.bookings}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Метрики</h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Response Rate</span>
                      <span className="text-white font-medium">{reportData.rates?.responseRate}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full"
                        style={{ width: `${reportData.rates?.responseRate || 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Conversion Rate</span>
                      <span className="text-white font-medium">{reportData.rates?.conversionRate}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${reportData.rates?.conversionRate || 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Overall Conversion</span>
                      <span className="text-white font-medium">{reportData.rates?.overallConversion}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${reportData.rates?.overallConversion || 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-700">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Прямые бронирования</span>
                      <span className="text-lg font-bold text-white">{reportData.funnel.directBookings}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400">Нет данных для отображения</p>
        </div>
      )}
    </div>
  );
}
