import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Activity, Zap, Shield, GitBranch, TrendingUp, RefreshCw, Clock } from 'lucide-react';

const cfgLabels: Record<string, string> = {
  autoDistribution: 'Auto Distribution',
  autoSurge: 'Auto Surge',
  autoVisibility: 'Auto Visibility',
  autoNotifications: 'Auto Notifications',
  autoChains: 'Auto Chains',
  dryRunMode: 'Dry Run Mode',
};

export default function AutomationDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => { try { setData((await adminAPI.getAutomationDashboard()).data); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);
  if (loading) return <div className="p-6 text-slate-400" data-testid="auto-dashboard-loading">Загрузка...</div>;
  if (!data) return <div className="p-6 text-red-400">Ошибка загрузки</div>;
  const cards = [
    { t: 'Auto Rules', v: `${data.autoActions?.active||0}/${data.autoActions?.total||0}`, s: `${data.autoActions?.executions24h||0} выполн./24ч`, icon: Zap, c: 'text-amber-400 bg-amber-500/20' },
    { t: 'Action Chains', v: `${data.actionChains?.active||0}/${data.actionChains?.total||0}`, s: 'Активных', icon: GitBranch, c: 'text-blue-400 bg-blue-500/20' },
    { t: 'Failsafe', v: `${data.failsafe?.rules||0} правил`, s: `${data.failsafe?.openIncidents||0} открытых инцидентов`, icon: Shield, c: data.failsafe?.openIncidents > 0 ? 'text-red-400 bg-red-500/20' : 'text-green-400 bg-green-500/20' },
    { t: 'Feedback', v: `${data.feedback?.positiveRate||0}%`, s: `${data.feedback?.total||0} записей`, icon: TrendingUp, c: 'text-emerald-400 bg-emerald-500/20' },
  ];
  const sc: Record<string,string> = { surplus: 'bg-blue-500', balanced: 'bg-green-500', busy: 'bg-amber-500', surge: 'bg-orange-500', critical: 'bg-red-500' };
  return (
    <div className="p-6 space-y-6" data-testid="automation-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automation Engine</h1>
          <p className="text-slate-400 text-sm">Единый центр управления</p>
        </div>
        <button onClick={load} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 flex items-center gap-2" data-testid="refresh-btn"><RefreshCw size={16}/>Обновить</button>
      </div>
      <div className="grid grid-cols-4 gap-4">{cards.map((c,i)=><div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4"><div className="flex items-center gap-3 mb-3"><div className={`p-2 rounded-lg ${c.c}`}><c.icon size={20}/></div><span className="text-slate-400 text-sm font-medium">{c.t}</span></div><div className="text-2xl font-bold text-white">{c.v}</div><div className="text-sm text-slate-500 mt-1">{c.s}</div></div>)}</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Activity size={18}/>Market State</h3>
          {data.marketState&&(<div className="space-y-3"><div className="flex items-center gap-3"><span className={`px-3 py-1 rounded-full text-sm font-medium text-white ${sc[data.marketState.state]||'bg-slate-600'}`}>{data.marketState.state?.toUpperCase()}</span><span className="text-slate-400">Ratio: {data.marketState.ratio}</span></div><div className="grid grid-cols-3 gap-2 text-sm"><div className="bg-slate-700/50 rounded-lg p-2"><div className="text-slate-500">Спрос</div><div className="text-white font-medium">{data.marketState.demandCount||0}</div></div><div className="bg-slate-700/50 rounded-lg p-2"><div className="text-slate-500">Предложение</div><div className="text-white font-medium">{data.marketState.supplyCount||0}</div></div><div className="bg-slate-700/50 rounded-lg p-2"><div className="text-slate-500">Конверсия</div><div className="text-white font-medium">{data.marketState.conversionRate||0}%</div></div></div></div>)}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Zap size={18}/>Config</h3>
          {data.automationConfig&&(<div className="space-y-2">{Object.keys(cfgLabels).map(k=><div key={k} className="flex items-center justify-between py-1"><span className="text-slate-400 text-sm">{cfgLabels[k]}</span><span className={`px-2 py-0.5 rounded text-xs font-medium ${data.automationConfig[k]?'bg-green-500/20 text-green-400':'bg-slate-700 text-slate-500'}`}>{data.automationConfig[k]?'ON':'OFF'}</span></div>)}</div>)}
        </div>
      </div>
      <div className="text-xs text-slate-600 flex items-center gap-2"><Clock size={12}/>Обновлено: {data.timestamp?new Date(data.timestamp).toLocaleString('ru-RU'):'N/A'}</div>
    </div>);
}
