import { useState, useEffect } from 'react';
import { FileText, Zap, RotateCcw, XCircle, RefreshCw, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import { adminAPI } from '../services/api';

interface DemandItem {
  id: string;
  description: string;
  status: string;
  createdAt: string;
  responseCount: number;
  urgency: string;
  city: string;
}

interface DemandStats {
  total: number;
  pending: number;
  responded: number;
  closed: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  open: 'bg-blue-500/20 text-blue-400',
  responded: 'bg-green-500/20 text-green-400',
  matched: 'bg-emerald-500/20 text-emerald-400',
  closed: 'bg-slate-500/20 text-slate-400',
  completed: 'bg-green-600/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

export default function DemandControlPage() {
  const [items, setItems] = useState<DemandItem[]>([]);
  const [stats, setStats] = useState<DemandStats>({ total: 0, pending: 0, responded: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getDemandControl();
      setItems(res.data.items || []);
      setStats(res.data.stats || { total: 0, pending: 0, responded: 0, closed: 0 });
    } catch (err) {
      console.error('Failed to load demand data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAction = async (quoteId: string, action: string) => {
    setActionLoading(`${quoteId}-${action}`);
    try {
      await adminAPI.forceQuoteAction(quoteId, action);
      loadData();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen" data-testid="demand-control-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <TrendingUp className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Demand Control</h1>
            <p className="text-sm text-slate-400">Управление входящими заявками в реальном времени</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          data-testid="refresh-demand"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <span className="text-sm text-slate-400">Total Today</span>
          <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <span className="text-sm text-yellow-400">Pending</span>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.pending}</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <span className="text-sm text-green-400">Responded</span>
          <p className="text-2xl font-bold text-green-400 mt-1">{stats.responded}</p>
        </div>
        <div className="bg-slate-500/10 border border-slate-600 rounded-xl p-4">
          <span className="text-sm text-slate-400">Closed</span>
          <p className="text-2xl font-bold text-slate-300 mt-1">{stats.closed}</p>
        </div>
      </div>

      {/* Quotes Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Заявка</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Статус</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Город</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Ответы</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Время</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Загрузка...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Нет заявок за сегодня</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-750">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-white text-sm">{item.description}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{item.id.slice(-8)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[item.status] || 'bg-slate-600 text-slate-300'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{item.city}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${item.responseCount === 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {item.responseCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAction(item.id, 'force_boost')}
                        disabled={actionLoading !== null}
                        className="p-1.5 hover:bg-green-500/20 rounded text-green-400"
                        title="Force Boost"
                      >
                        <Zap size={14} />
                      </button>
                      <button
                        onClick={() => handleAction(item.id, 'force_distribute')}
                        disabled={actionLoading !== null}
                        className="p-1.5 hover:bg-blue-500/20 rounded text-blue-400"
                        title="Force Distribute"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => handleAction(item.id, 'force_cancel')}
                        disabled={actionLoading !== null}
                        className="p-1.5 hover:bg-red-500/20 rounded text-red-400"
                        title="Force Cancel"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
