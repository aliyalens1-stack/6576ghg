import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Zap, Plus, Play, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff, RefreshCw, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function AutoActionsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [promoteResult, setPromoteResult] = useState<any>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', triggerType: 'zone', actionType: 'set_surge', cooldownSeconds: 300, priority: 5 });

  const load = async () => { try { setRules((await adminAPI.getAutoRules()).data); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await adminAPI.createAutoRule({ ...form, conditionJson: { field: 'ratio', operator: '>', value: 2 }, actionPayload: {} });
      setShowCreate(false);
      load();
    } catch {}
  };

  const promote = async (id: string) => {
    setPromoting(id);
    try {
      const res = await adminAPI.promoteAutoRule(id);
      setPromoteResult(res.data);
      load();
    } catch {} finally {
      setPromoting(null);
    }
  };

  const fmt = (s: string) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';

  if (loading) return <div className="p-6 text-slate-400" data-testid="auto-actions-loading">Загрузка...</div>;

  return (
    <div className="p-6 space-y-6" data-testid="auto-actions-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Auto-Action Rules</h1>
          <p className="text-slate-400 text-sm">Автоматические правила реагирования на рынок</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300" data-testid="refresh-rules">
            <RefreshCw size={16}/>
          </button>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center gap-2" data-testid="create-rule-btn">
            <Plus size={16}/>Новое правило
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4" data-testid="create-rule-form">
          <h3 className="text-white font-semibold">Создать правило</h3>
          <div className="grid grid-cols-2 gap-4">
            <input className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Название правила" value={form.name} onChange={e => setForm({...form, name: e.target.value})} data-testid="rule-name-input"/>
            <select className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" value={form.actionType} onChange={e => setForm({...form, actionType: e.target.value})} data-testid="rule-action-select">
              <option value="set_surge">Set Surge</option>
              <option value="send_push">Send Push</option>
              <option value="expand_radius">Expand Radius</option>
              <option value="boost_visibility">Boost Visibility</option>
              <option value="limit_visibility">Limit Visibility</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={create} className="px-4 py-2 bg-amber-500 text-white rounded-lg" data-testid="submit-rule-btn">Создать</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg">Отмена</button>
          </div>
        </div>
      )}

      {/* Promote Result Banner */}
      {promoteResult && (
        <div className={`border rounded-xl p-4 ${promoteResult.allChecksPassed ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'}`} data-testid="promote-result">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {promoteResult.allChecksPassed ? <CheckCircle2 size={20} className="text-green-400"/> : <AlertTriangle size={20} className="text-amber-400"/>}
              <div>
                <span className="text-white font-medium">{promoteResult.name}</span>
                <span className="text-slate-400 mx-2">
                  {promoteResult.previousMode} → {promoteResult.newMode}
                </span>
              </div>
            </div>
            <button onClick={() => setPromoteResult(null)} className="text-slate-500 hover:text-slate-300 text-sm">Dismiss</button>
          </div>
          {promoteResult.checks?.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {promoteResult.checks.map((c: any) => (
                <div key={c.name} className={`rounded-lg px-3 py-1.5 text-sm ${c.passed ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {c.passed ? '✓' : '✗'} {c.name.replace(/_/g, ' ')} ({c.detail})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3" data-testid="rules-list">
        {rules.map((r: any) => (
          <div key={r.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4" data-testid={`rule-${r.id}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Zap size={18} className={r.isEnabled ? 'text-amber-400' : 'text-slate-600'}/>
                <div>
                  <span className="text-white font-medium">{r.name}</span>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">{r.triggerType}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">{fmt(r.actionType)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${r.mode === 'shadow' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                      {r.mode || 'active'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Promote button */}
                <button
                  onClick={() => promote(r.id)}
                  disabled={promoting === r.id}
                  className={`p-2 hover:bg-slate-700 rounded-lg flex items-center gap-1 text-sm ${
                    r.mode === 'shadow' ? 'text-green-400' : 'text-purple-400'
                  }`}
                  title={r.mode === 'shadow' ? 'Перевести в Active' : 'Перевести в Shadow'}
                  data-testid={`promote-${r.id}`}
                >
                  {promoting === r.id ? (
                    <RefreshCw size={14} className="animate-spin"/>
                  ) : r.mode === 'shadow' ? (
                    <><ArrowUpRight size={14}/><span className="hidden xl:inline">Promote</span></>
                  ) : (
                    <><ArrowDownRight size={14}/><span className="hidden xl:inline">Demote</span></>
                  )}
                </button>
                <button onClick={() => adminAPI.testAutoRule(r.id).then(load)} className="p-2 hover:bg-slate-700 rounded-lg text-blue-400" data-testid={`test-${r.id}`}><Play size={16}/></button>
                <button onClick={() => adminAPI.toggleAutoRule(r.id).then(load)} className={`p-2 hover:bg-slate-700 rounded-lg ${r.isEnabled ? 'text-green-400' : 'text-slate-600'}`} data-testid={`toggle-${r.id}`}>
                  {r.isEnabled ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                </button>
                <button onClick={() => adminAPI.deleteAutoRule(r.id).then(load)} className="p-2 hover:bg-slate-700 rounded-lg text-red-400" data-testid={`del-${r.id}`}><Trash2 size={16}/></button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="bg-slate-700/50 rounded-lg p-2"><div className="text-slate-500">Выполнений</div><div className="text-white">{r.stats?.total || 0}</div></div>
              <div className="bg-slate-700/50 rounded-lg p-2"><div className="text-slate-500">Успешность</div><div className="text-white">{r.stats?.successRate || 0}%</div></div>
              <div className="bg-slate-700/50 rounded-lg p-2"><div className="text-slate-500">Cooldown</div><div className="text-white">{r.cooldownSeconds}s</div></div>
              <div className="bg-slate-700/50 rounded-lg p-2"><div className="text-slate-500">Приоритет</div><div className="text-white">{r.priority}</div></div>
            </div>
          </div>
        ))}
        {rules.length === 0 && <div className="text-center text-slate-500 py-8">Нет правил</div>}
      </div>
    </div>
  );
}
