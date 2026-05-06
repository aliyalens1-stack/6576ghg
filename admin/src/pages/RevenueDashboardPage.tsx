import { useEffect, useState } from 'react';
import api from '../services/api';

type Alert = {
  type: 'danger' | 'warning' | 'info';
  text: string;
};

type RevenueSummary = {
  today: number;
  yesterday?: number;
  week: number;
  lastWeek?: number;
  month: number;
  currency: string;
  transactions: number;
  paidTransactions: number;
  failedTransactions: number;
  boostRevenue: number;
  avgOrderValue: number;
  conversionRate: number;
  growth?: { vsYesterday: number; vsLastWeek: number };
  revenueBreakdown?: { boost: number; subscription: number; other: number };
  alerts?: Alert[];
  topProviders: Array<{
    providerId: string;
    name: string;
    revenue: number;
    transactions: number;
    boostLevel?: string | null;
  }>;
  topZones: Array<{
    zoneId: string;
    name: string;
    revenue: number;
    transactions: number;
  }>;
  recent: Array<{
    id: string;
    providerId: string;
    amount: number;
    status: string;
    type: string;
    createdAt: string;
  }>;
};

function money(value: number, currency = 'UAH') {
  try {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `${value || 0} ${currency}`;
  }
}

function pct(v: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((v / total) * 100);
}

function formatGrowth(g: number | undefined): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  if (g === undefined || g === null || !isFinite(g)) return { text: '—', tone: 'neutral' };
  const sign = g > 0 ? '+' : '';
  const text = `${sign}${Math.round(g * 100)}%`;
  return { text, tone: g > 0 ? 'good' : g < 0 ? 'bad' : 'neutral' };
}

export default function RevenueDashboardPage() {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get('/admin/revenue/summary');
      setData(res.data);
      setErr(null);
    } catch (e: any) {
      setErr(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading revenue…</div>;
  if (err || !data) return <div className="p-6 text-sm text-red-600">Failed to load revenue: {err}</div>;

  const gToday = formatGrowth(data.growth?.vsYesterday);
  const gWeek = formatGrowth(data.growth?.vsLastWeek);
  const breakdown = data.revenueBreakdown || { boost: 0, subscription: 0, other: 0 };
  const breakdownTotal = breakdown.boost + breakdown.subscription + breakdown.other;

  return (
    <div className="p-6 space-y-6" data-testid="revenue-dashboard">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Finance</p>
        <h1 className="text-3xl font-bold">Revenue Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Stripe + boost sales, provider monetization, conversion metrics. Auto-refresh каждые 15с.
        </p>
      </div>

      {/* Alerts — что орёт */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="space-y-2" data-testid="revenue-alerts">
          {data.alerts.map((a, i) => (
            <div
              key={i}
              data-testid={`alert-${a.type}`}
              className={
                a.type === 'danger'
                  ? 'rounded-xl border border-red-300 bg-red-50 p-4 flex items-start gap-3'
                  : a.type === 'warning'
                    ? 'rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3'
                    : 'rounded-xl border border-blue-300 bg-blue-50 p-4 flex items-start gap-3'
              }
            >
              <span
                className={
                  a.type === 'danger'
                    ? 'w-2 h-2 rounded-full bg-red-500 mt-2'
                    : a.type === 'warning'
                      ? 'w-2 h-2 rounded-full bg-amber-500 mt-2'
                      : 'w-2 h-2 rounded-full bg-blue-500 mt-2'
                }
              />
              <div className="flex-1">
                <p
                  className={
                    a.type === 'danger'
                      ? 'text-sm font-semibold text-red-900'
                      : a.type === 'warning'
                        ? 'text-sm font-semibold text-amber-900'
                        : 'text-sm font-semibold text-blue-900'
                  }
                >
                  {a.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hero — Today big with growth */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-1"
          data-testid="hero-today"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Сегодня</p>
          <h2 className="mt-2 text-4xl font-bold text-slate-900">{money(data.today, data.currency)}</h2>
          <p
            className={
              gToday.tone === 'good'
                ? 'mt-2 text-sm font-semibold text-emerald-600'
                : gToday.tone === 'bad'
                  ? 'mt-2 text-sm font-semibold text-red-600'
                  : 'mt-2 text-sm font-semibold text-slate-500'
            }
            data-testid="growth-vs-yesterday"
          >
            {gToday.text} vs вчера{data.yesterday !== undefined ? ` (${money(data.yesterday, data.currency)})` : ''}
          </p>
        </div>
        <div
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-1"
          data-testid="hero-week"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">7 дней</p>
          <h2 className="mt-2 text-4xl font-bold text-slate-900">{money(data.week, data.currency)}</h2>
          <p
            className={
              gWeek.tone === 'good'
                ? 'mt-2 text-sm font-semibold text-emerald-600'
                : gWeek.tone === 'bad'
                  ? 'mt-2 text-sm font-semibold text-red-600'
                  : 'mt-2 text-sm font-semibold text-slate-500'
            }
            data-testid="growth-vs-lastweek"
          >
            {gWeek.text} vs прошлая неделя
          </p>
        </div>
        <div
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-1"
          data-testid="hero-month"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">30 дней</p>
          <h2 className="mt-2 text-4xl font-bold text-slate-900">{money(data.month, data.currency)}</h2>
          <p className="mt-2 text-sm text-slate-500">
            Avg order: <span className="font-semibold">{money(data.avgOrderValue, data.currency)}</span>
          </p>
        </div>
      </div>

      {/* Operational metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric title="Transactions 30d" value={String(data.transactions)} testId="metric-txn" />
        <Metric title="Paid" value={String(data.paidTransactions)} tone="good" testId="metric-paid" />
        <Metric title="Failed" value={String(data.failedTransactions)} tone="bad" testId="metric-failed" />
        <Metric
          title="Conversion"
          value={`${Math.round(data.conversionRate * 100)}%`}
          testId="metric-conv"
        />
      </div>

      {/* Revenue sources — где деньги */}
      <Panel title="Где деньги (revenue sources, 30 дней)" testId="revenue-breakdown">
        <div className="space-y-3">
          <BreakdownRow
            label="Boost packages"
            value={breakdown.boost}
            total={breakdownTotal}
            currency={data.currency}
            tone="good"
            testId="breakdown-boost"
          />
          <BreakdownRow
            label="Subscription"
            value={breakdown.subscription}
            total={breakdownTotal}
            currency={data.currency}
            testId="breakdown-subscription"
          />
          <BreakdownRow
            label="Прочее (заказы / комиссии)"
            value={breakdown.other}
            total={breakdownTotal}
            currency={data.currency}
            testId="breakdown-other"
          />
        </div>
      </Panel>

      {/* Top providers + zones */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Top paying providers" testId="top-providers">
          <div className="space-y-3">
            {data.topProviders.length === 0 && <Empty text="No provider payments yet." />}
            {data.topProviders.map((p) => (
              <div
                key={p.providerId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                data-testid={`provider-row-${p.providerId}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.transactions} transactions
                    {p.boostLevel ? ` · ${p.boostLevel.toUpperCase()} boost` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5" data-testid={`provider-share-${p.providerId}`}>
                    даёт {pct(p.revenue, data.month)}% от месячного дохода
                  </p>
                </div>
                <p className="font-bold tabular-nums">{money(p.revenue, data.currency)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Top revenue zones" testId="top-zones">
          <div className="space-y-3">
            {data.topZones.length === 0 && <Empty text="No zone revenue yet." />}
            {data.topZones.map((z) => (
              <div
                key={z.zoneId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-semibold">{z.name}</p>
                  <p className="text-xs text-slate-500">{z.transactions} transactions</p>
                </div>
                <p className="font-bold tabular-nums">{money(z.revenue, data.currency)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Recent transactions" testId="recent">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Provider</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No transactions yet.
                  </td>
                </tr>
              )}
              {data.recent.map((r) => (
                <tr key={r.id} className="border-t border-slate-200">
                  <td className="py-3">{r.providerId || '—'}</td>
                  <td>{r.type}</td>
                  <td>
                    <span
                      className={
                        r.status === 'paid' || r.status === 'completed'
                          ? 'text-emerald-600 font-medium'
                          : r.status === 'failed'
                            ? 'text-red-600 font-medium'
                            : 'text-slate-500'
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="tabular-nums">{money(r.amount, data.currency)}</td>
                  <td className="text-slate-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Metric({
  title,
  value,
  tone,
  testId,
}: {
  title: string;
  value: string;
  tone?: 'good' | 'bad';
  testId?: string;
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid={testId}>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className={`mt-3 text-3xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  total,
  currency,
  tone,
  testId,
}: {
  label: string;
  value: number;
  total: number;
  currency: string;
  tone?: 'good';
  testId?: string;
}) {
  const share = pct(value, total);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid={testId}>
      <div className="flex items-center justify-between mb-2">
        <p className={tone === 'good' ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-900'}>
          {label}
        </p>
        <p className="font-bold tabular-nums">{money(value, currency)}</p>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={tone === 'good' ? 'h-full bg-emerald-500' : 'h-full bg-slate-500'}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 mt-1.5">{share}% от общего</p>
    </div>
  );
}

function Panel({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900"
      data-testid={testId}
    >
      <h2 className="text-lg font-bold mb-4 text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
