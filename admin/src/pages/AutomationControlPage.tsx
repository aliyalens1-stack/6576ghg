import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';

export default function AutomationControlPage() {
  const [config, setConfig] = useState<any>(null); const [loading, setLoading] = useState(true);
  const load = async () => { try { setConfig((await adminAPI.getAutoConfig()).data); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const toggle = async (key: string) => { const u = { ...config, [key]: !config[key] }; setConfig(u); try { await adminAPI.updateAutoConfig(u); } catch { load(); } };
  if (loading) return <div className="p-6 text-slate-400" data-testid="control-loading">Загрузка...</div>;
  const toggles = [
    {k:'autoDistribution',l:'Auto Distribution',d:'Автоматическое распределение заявок мастерам'},
    {k:'autoSurge',l:'Auto Surge',d:'Динамическое ценообразование'},
    {k:'autoVisibility',l:'Auto Visibility',d:'Автоматическая регулировка видимости мастеров'},
    {k:'autoNotifications',l:'Auto Notifications',d:'Автоматическая отправка push-уведомлений'},
    {k:'autoChains',l:'Auto Chains',d:'Многошаговые автоматические цепочки'},
    {k:'dryRunMode',l:'Dry Run Mode',d:'Симуляция без реального выполнения'},
    {k:'requireOperatorApprovalForCritical',l:'Require Approval',d:'Критические действия требуют подтверждения оператора'},
  ];
  return (<div className="p-6 space-y-6" data-testid="automation-control-page"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-white">Automation Control</h1><p className="text-slate-400 text-sm">Главные переключатели системы</p></div><button onClick={load} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300" data-testid="refresh-control"><RefreshCw size={16}/></button></div><div className="space-y-3" data-testid="toggles-list">{toggles.map(t=><div key={t.k} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between" data-testid={`toggle-${t.k}`}><div><div className="text-white font-medium">{t.l}</div><div className="text-slate-400 text-sm mt-0.5">{t.d}</div></div><button onClick={()=>toggle(t.k)} className={`p-1 rounded-lg ${config?.[t.k]?'text-green-400':'text-slate-600'}`} data-testid={`btn-${t.k}`}>{config?.[t.k]?<ToggleRight size={32}/>:<ToggleLeft size={32}/>}</button></div>)}</div></div>);
}
