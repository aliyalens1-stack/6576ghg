import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { EyeOff, ArrowUpRight, ArrowDownRight, RefreshCw, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';

const fmt = (s: string) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';

export default function ShadowModePage() {
  const [comparison, setComparison] = useState<any>(null);
  const [shadowHistory, setShadowHistory] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteResult, setPromoteResult] = useState<any>(null);

  const load = async () => {
    try {
      const [comp, hist, rls] = await Promise.all([
        adminAPI.getShadowComparison(),
        adminAPI.getShadowHistory(20),
        adminAPI.getAutoRules(),
      ]);
      setComparison(comp.data);
      setShadowHistory(hist.data);
      setRules(rls.data);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const shadowRules = rules.filter(r => r.mode === 'shadow');
  const activeRules = rules.filter(r => r.mode === 'active' || !r.mode);

  const promote = async (id: string) => {
    setPromoting(id);
    try { const res = await adminAPI.promoteAutoRule(id); setPromoteResult(res.data); load(); } catch {} finally { setPromoting(null); }
  };

  const bulkPromote = async () => {
    const ids = shadowRules.filter(r => r.isEnabled).map(r => r.id);
    if (ids.length === 0) return;
    try { const res = await adminAPI.bulkPromoteRules(ids); setPromoteResult(res.data); load(); } catch {}
  };

  if (loading) return <div className="p-6 text-slate-400" data-testid="shadow-loading">Загрузка...</div>;

  return (
    <div className="p-6 space-y-6" data-testid="shadow-mode-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Shadow Mode</h1>
          <p className="text-slate-400 text-sm">Сравнение Active vs Shadow и продвижение правил</p>
        </div>
        <div className="flex gap-2">
          {shadowRules.filter(r => r.isEnabled).length > 0 && (
            <button onClick={bulkPromote} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2" data-testid="bulk-promote-btn">
              <ArrowUpRight size={16}/>Promote All Shadow ({shadowRules.filter(r => r.isEnabled).length})
            </button>
          )}
          <button onClick={load} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300" data-testid="refresh-shadow"><RefreshCw size={16}/></button>
        </div>
      </div>

      {promoteResult && (
        <div className="bg-slate-800 border border-amber-500/30 rounded-xl p-4" data-testid="promote-banner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Результат продвижения</span>
            <button onClick={() => setPromoteResult(null)} className="text-slate-500 text-sm">Закрыть</button>
          </div>
          {promoteResult.results ? (
            <div className="text-sm text-slate-300">Продвинуто {promoteResult.promoted}/{promoteResult.total} правил</div>
          ) : promoteResult.checks && (
            <div className="grid grid-cols-4 gap-2 text-sm">
              {promoteResult.checks.map((c: any) => (
                <div key={c.name} className={`rounded-lg px-3 py-1.5 ${c.passed ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {c.passed ? <CheckCircle2 size={12} className="inline mr-1"/> : <AlertTriangle size={12} className="inline mr-1"/>}
                  {fmt(c.name)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {comparison && (
        <div className="grid grid-cols-2 gap-4" data-testid="shadow-comparison">
          {[
            { key: 'active', label: 'Active правила', color: 'green' },
            { key: 'shadow', label: 'Shadow правила', color: 'purple' },
          ].map(({ key, label, color }) => {
            const d = comparison[key] || {};
            return (
              <div key={key} className={`bg-slate-800 border border-${color}-500/30 rounded-xl p-5`}>
                <h3 className={`text-${color}-400 font-semibold mb-4 flex items-center gap-2`}>
                  {key === 'shadow' ? <EyeOff size={18}/> : <Activity size={18}/>}
                  {label}
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-700/50 rounded-lg p-3"><div className="text-slate-500">Выполнений</div><div className="text-white text-lg font-bold">{d.count || 0}</div></div>
                  <div className="bg-slate-700/50 rounded-lg p-3"><div className="text-slate-500">Ср. конверсия</div><div className="text-white text-lg font-bold">{d.avgConversion || 0}%</div></div>
                  <div className="bg-slate-700/50 rounded-lg p-3"><div className="text-slate-500">Ср. ETA</div><div className="text-white text-lg font-bold">{d.avgEta || 0}m</div></div>
                  <div className="bg-slate-700/50 rounded-lg p-3"><div className="text-slate-500">Выручка</div><div className="text-white text-lg font-bold">${d.totalRevenue || 0}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><EyeOff size={18} className="text-purple-400"/>Shadow правила ({shadowRules.length})</h3>
        {shadowRules.length > 0 ? (
          <div className="space-y-2">
            {shadowRules.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3" data-testid={`shadow-rule-${r.id}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${r.isEnabled ? 'bg-purple-400' : 'bg-slate-600'}`}/>
                  <div><span className="text-white font-medium">{r.name}</span><span className="text-slate-500 text-sm ml-2">{fmt(r.actionType)}</span></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">{r.stats?.total || 0} выполн., {r.stats?.successRate || 0}%</span>
                  <button onClick={() => promote(r.id)} disabled={promoting === r.id} className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-sm flex items-center gap-1" data-testid={`promote-shadow-${r.id}`}>
                    {promoting === r.id ? <RefreshCw size={14} className="animate-spin"/> : <ArrowUpRight size={14}/>}Promote
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (<div className="text-slate-500 text-center py-4">Нет Shadow правил</div>)}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Activity size={18} className="text-green-400"/>Active правила ({activeRules.length})</h3>
        <div className="space-y-2">
          {activeRules.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3" data-testid={`active-rule-${r.id}`}>
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${r.isEnabled ? 'bg-green-400' : 'bg-slate-600'}`}/>
                <div><span className="text-white font-medium">{r.name}</span><span className="text-slate-500 text-sm ml-2">{fmt(r.actionType)}</span></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">{r.stats?.total || 0} выполн., {r.stats?.successRate || 0}%</span>
                <button onClick={() => promote(r.id)} disabled={promoting === r.id} className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-sm flex items-center gap-1" data-testid={`demote-active-${r.id}`}>
                  {promoting === r.id ? <RefreshCw size={14} className="animate-spin"/> : <ArrowDownRight size={14}/>}Demote
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {shadowHistory.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5" data-testid="shadow-history">
          <h3 className="text-white font-semibold mb-3">История Shadow выполнений</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {shadowHistory.map((h: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-slate-700/50 rounded px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500"/>
                  <span className="text-slate-300">{fmt(h.actionType)}</span>
                  <span className="text-slate-500">{h.ruleName}</span>
                </div>
                <span className="text-slate-500 text-xs">{h.createdAt ? new Date(h.createdAt).toLocaleString('ru-RU') : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
