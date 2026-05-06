import { useState, useEffect } from 'react';
import { Users, Clock, CheckCircle, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import api from '../services/api';

interface Operator {
  id: string;
  name: string;
  email: string;
  role: string;
  tasksResolved: number;
  avgResponseTime: number;
  errors: number;
  successRate: number;
  lastActive: string;
}

interface OperatorData {
  operators: Operator[];
  summary: {
    totalOperators: number;
    avgResponseTime: number;
    totalTasksResolved: number;
    avgSuccessRate: number;
  };
}

export default function OperatorPerformancePage() {
  const [data, setData] = useState<OperatorData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/operators/performance');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load operator data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="operator-performance-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Users className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Operator Performance</h1>
            <p className="text-slate-400 text-sm">Метрики работы операторов</p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
          data-testid="refresh-btn"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Users className="w-4 h-4" />
              Всего операторов
            </div>
            <div className="text-2xl font-bold text-white">{data.summary.totalOperators}</div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Clock className="w-4 h-4" />
              Среднее время ответа
            </div>
            <div className="text-2xl font-bold text-yellow-400">{formatTime(data.summary.avgResponseTime)}</div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <CheckCircle className="w-4 h-4" />
              Задач решено
            </div>
            <div className="text-2xl font-bold text-green-400">{data.summary.totalTasksResolved}</div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Activity className="w-4 h-4" />
              Успешность
            </div>
            <div className="text-2xl font-bold text-blue-400">{data.summary.avgSuccessRate}%</div>
          </div>
        </div>
      )}

      {/* Operators Table */}
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="text-left p-4 text-slate-400 font-medium">Оператор</th>
              <th className="text-left p-4 text-slate-400 font-medium">Роль</th>
              <th className="text-center p-4 text-slate-400 font-medium">Задач решено</th>
              <th className="text-center p-4 text-slate-400 font-medium">Время ответа</th>
              <th className="text-center p-4 text-slate-400 font-medium">Ошибки</th>
              <th className="text-center p-4 text-slate-400 font-medium">Успешность</th>
              <th className="text-center p-4 text-slate-400 font-medium">Последняя активность</th>
            </tr>
          </thead>
          <tbody>
            {data?.operators.map((op) => (
              <tr key={op.id} className="border-t border-slate-700 hover:bg-slate-700/30">
                <td className="p-4">
                  <div>
                    <div className="text-white font-medium">{op.name}</div>
                    <div className="text-slate-400 text-sm">{op.email}</div>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    op.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {op.role}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-white font-medium">{op.tasksResolved}</span>
                </td>
                <td className="p-4 text-center">
                  <span className={`font-medium ${
                    op.avgResponseTime < 120 ? 'text-green-400' :
                    op.avgResponseTime < 300 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {formatTime(op.avgResponseTime)}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className={`font-medium ${op.errors > 5 ? 'text-red-400' : 'text-slate-300'}`}>
                    {op.errors}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          op.successRate >= 90 ? 'bg-green-500' :
                          op.successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${op.successRate}%` }}
                      />
                    </div>
                    <span className="text-white text-sm">{op.successRate}%</span>
                  </div>
                </td>
                <td className="p-4 text-center text-slate-400 text-sm">
                  {formatDate(op.lastActive)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
