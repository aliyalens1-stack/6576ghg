import { useState, useEffect } from 'react';
import { Zap, Play, Clock, RefreshCw, ChevronRight, AlertTriangle, CheckCircle2, Send, TrendingUp, Maximize2 } from 'lucide-react';
import { adminAPI } from '../services/api';

const stateColors: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'CRITICAL' },
  surge: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'SURGE' },
  busy: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'BUSY' },
  balanced: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'BALANCED' },
};

const actionIcons: Record<string, any> = {
  push_providers: Send, activate_surge: TrendingUp, increase_distribution: Maximize2,
  expand_radius: Maximize2, escalate: AlertTriangle,
};

export default function DemandActionsPage() {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [recRes, histRes] = await Promise.all([
        adminAPI.getDemandActionRecommendations(),
        adminAPI.getDemandActionsHistory(),
      ]);
      setData(recRes.data);
      setHistory(histRes.data.executions || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleRun = async () => {
    if (!data?.zoneId) return;
    setRunning(true);
    try {
      await adminAPI.runDemandAction({ zoneId: data.zoneId, chainId: selectedChain || undefined, mode: 'manual' });
      loadData();
    } catch (err) { console.error(err); }
    finally { setRunning(false); }
  };

  const st = stateColors[data?.state] || stateColors.balanced;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Zap className="h-6 w-6 text-yellow-400" /> Demand → Action Chains</h1>
          <p className="text-slate-400 mt-1">Auto-reaction engine для управления спросом</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 text-sm text-white">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить
        </button>
      </div>

      {data && (
        <>
          {/* Zone Status */}
          <div className={`rounded-xl p-5 border ${st.bg} border-opacity-30`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded font-bold ${st.bg} ${st.text}`}>{st.label}</span>
                  <span className="text-white text-lg font-semibold">Zone: {data.zoneId}</span>
                </div>
                <div className="flex gap-6 mt-3 text-sm">
                  <span className="text-slate-300">Requests: <strong className="text-white">{data.requests}</strong></span>
                  <span className="text-slate-300">Providers: <strong className="text-white">{data.providers}</strong></span>
                  <span className="text-slate-300">Ratio: <strong className={st.text}>{data.ratio}</strong></span>
                  <span className="text-slate-300">ETA: <strong className="text-white">{data.avgEta} мин</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {data.recommendations?.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-white font-semibold mb-3">Рекомендации системы</h3>
              <div className="space-y-2">
                {data.recommendations.map((rec: any, i: number) => {
                  const Icon = actionIcons[rec.type] || Zap;
                  return (
                    <div key={i} className="flex items-center gap-3 bg-slate-700/30 rounded-lg p-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <span className="text-white text-sm font-medium">{rec.description}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${rec.impact === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{rec.impact}</span>
                      </div>
                      <span className="text-slate-500 text-xs">#{rec.priority}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chain Picker + Run */}
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-white font-semibold mb-3">Action Chain</h3>
            <div className="flex gap-3">
              <select value={selectedChain} onChange={e => setSelectedChain(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm">
                <option value="">Автоматический выбор</option>
                {(data.availableChains || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.steps} шагов)</option>
                ))}
              </select>
              <button onClick={handleRun} disabled={running}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 disabled:opacity-50">
                <Play className="h-4 w-4" /> {running ? 'Запуск...' : 'Run Now'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Execution History */}
      {history.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" /> История выполнения</h3>
          <div className="space-y-2">
            {history.slice(0, 5).map((ex: any) => (
              <div key={ex.id} className="bg-slate-700/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-white text-sm font-medium">Zone: {ex.zoneId}</span>
                    <span className="text-slate-400 text-xs">• {ex.steps?.length || 0} шагов</span>
                  </div>
                  <span className="text-slate-500 text-xs">{new Date(ex.createdAt).toLocaleString()}</span>
                </div>
                {ex.resultMetrics && (
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-slate-300">Ratio: {ex.resultMetrics.ratioBefore} → <strong className="text-green-400">{ex.resultMetrics.ratioAfter}</strong></span>
                    <span className="text-slate-300">ETA: {ex.resultMetrics.etaBefore} → <strong className="text-green-400">{ex.resultMetrics.etaAfter} мин</strong></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
