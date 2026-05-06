import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function MonetizationPage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [promotingSlug, setPromotingSlug] = useState('');
  const [promoteBoost, setPromoteBoost] = useState(0.15);
  const [promoteLabel, setPromoteLabel] = useState('⭐ Рекомендуем');
  const [prioritySlug, setPrioritySlug] = useState('');
  const [priorityLevel, setPriorityLevel] = useState(1);
  const [priorityWindow, setPriorityWindow] = useState(20);
  const [actionLoading, setActionLoading] = useState(false);
  const [distConfig, setDistConfig] = useState<any>(null);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchData(); fetchDistConfig(); }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/monetization/overview`, { headers });
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchDistConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/distribution/config`, { headers });
      setDistConfig(res.data);
    } catch (e) { console.error(e); }
  };

  const handlePromote = async () => {
    if (!promotingSlug) return;
    setActionLoading(true);
    try {
      await axios.post(`${API_URL}/admin/providers/${promotingSlug}/promote`, { promotionBoost: promoteBoost, promotedLabel: promoteLabel }, { headers });
      setPromotingSlug('');
      fetchData();
    } catch (e) { alert('Ошибка при продвижении'); }
    finally { setActionLoading(false); }
  };

  const handleUnpromote = async (slug: string) => {
    try {
      await axios.post(`${API_URL}/admin/providers/${slug}/unpromote`, {}, { headers });
      fetchData();
    } catch (e) { alert('Ошибка'); }
  };

  const handleGrantPriority = async () => {
    if (!prioritySlug) return;
    setActionLoading(true);
    try {
      await axios.post(`${API_URL}/admin/providers/${prioritySlug}/priority-access`, { priorityLevel, priorityWindowSeconds: priorityWindow }, { headers });
      setPrioritySlug('');
      fetchData();
    } catch (e) { alert('Ошибка'); }
    finally { setActionLoading(false); }
  };

  const handleRemovePriority = async (slug: string) => {
    try {
      await axios.post(`${API_URL}/admin/providers/${slug}/priority-access/remove`, {}, { headers });
      fetchData();
    } catch (e) { alert('Ошибка'); }
  };

  const handleSaveDistConfig = async () => {
    if (!distConfig) return;
    try {
      await axios.post(`${API_URL}/admin/distribution/config`, distConfig, { headers });
      alert('Конфигурация сохранена');
    } catch (e) { alert('Ошибка сохранения'); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div></div>;

  const stats = data?.stats || {};
  const pm = data?.metrics?.promoted || {};
  const pr = data?.metrics?.priority || {};

  return (
    <div className="space-y-6" data-testid="monetization-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">💰 Монетизация</h1>
          <p className="text-sm text-slate-400 mt-1">Promoted Providers + Priority Requests</p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-slate-700 text-sm text-white rounded-lg hover:bg-slate-600">Обновить</button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400">Всего провайдеров</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalProviders}</p>
        </div>
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4">
          <p className="text-xs text-amber-400">⭐ Promoted</p>
          <p className="text-2xl font-bold text-amber-300 mt-1">{stats.promotedCount}</p>
        </div>
        <div className="bg-orange-900/30 border border-orange-700/50 rounded-xl p-4">
          <p className="text-xs text-orange-400">🔥 Priority</p>
          <p className="text-2xl font-bold text-orange-300 mt-1">{stats.priorityCount}</p>
        </div>
        <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-4">
          <p className="text-xs text-emerald-400">Monetization Rate</p>
          <p className="text-2xl font-bold text-emerald-300 mt-1">{stats.monetizationRate}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* ── PROMOTED ── */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-4 flex items-center gap-2">⭐ Promoted Providers</h2>
          
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">CTR</p>
              <p className="text-lg font-bold text-amber-300">{pm.conversionRate}%</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Bookings</p>
              <p className="text-lg font-bold text-white">{pm.bookings}</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Revenue Lift</p>
              <p className="text-lg font-bold text-emerald-300">+{pm.revenueLift}%</p>
            </div>
          </div>

          {/* Current Promoted */}
          <div className="space-y-2 mb-4">
            {(data?.promotedProviders || []).map((p: any) => (
              <div key={p.slug} className="flex items-center justify-between bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                <div>
                  <p className="font-medium text-white text-sm">{p.name}</p>
                  <p className="text-xs text-amber-400">Boost: +{p.promotionBoost} · {p.promotedLabel}</p>
                </div>
                <button onClick={() => handleUnpromote(p.slug)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-900/30" data-testid={`unpromote-${p.slug}`}>Снять</button>
              </div>
            ))}
            {(data?.promotedProviders || []).length === 0 && <p className="text-sm text-slate-500 text-center py-2">Нет promoted провайдеров</p>}
          </div>

          {/* Add Promoted */}
          <div className="border-t border-slate-700 pt-4 space-y-2">
            <p className="text-xs text-slate-400 font-semibold">Добавить Promoted</p>
            <input value={promotingSlug} onChange={e => setPromotingSlug(e.target.value)} placeholder="slug провайдера" className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600" data-testid="promote-slug-input" />
            <div className="flex gap-2">
              <input type="number" step="0.05" min="0" max="0.25" value={promoteBoost} onChange={e => setPromoteBoost(Number(e.target.value))} className="w-24 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600" />
              <input value={promoteLabel} onChange={e => setPromoteLabel(e.target.value)} className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600" />
            </div>
            <button onClick={handlePromote} disabled={actionLoading} className="w-full bg-amber-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-amber-500 disabled:opacity-50" data-testid="promote-btn">Продвинуть</button>
          </div>
        </div>

        {/* ── PRIORITY ── */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-4 flex items-center gap-2">🔥 Priority Requests</h2>
          
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Accept Rate</p>
              <p className="text-lg font-bold text-orange-300">{pr.acceptRate}%</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Avg Accept</p>
              <p className="text-lg font-bold text-white">{pr.avgAcceptTimeSeconds}s</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Revenue</p>
              <p className="text-lg font-bold text-emerald-300">{pr.providerRevenue}₴</p>
            </div>
          </div>

          {/* Current Priority */}
          <div className="space-y-2 mb-4">
            {(data?.priorityProviders || []).map((p: any) => (
              <div key={p.slug} className="flex items-center justify-between bg-orange-900/20 border border-orange-700/30 rounded-lg p-3">
                <div>
                  <p className="font-medium text-white text-sm">{p.name}</p>
                  <p className="text-xs text-orange-400">Level: {p.priorityLevel} · Window: {p.priorityWindowSeconds || 20}s</p>
                </div>
                <button onClick={() => handleRemovePriority(p.slug)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-900/30" data-testid={`remove-priority-${p.slug}`}>Убрать</button>
              </div>
            ))}
            {(data?.priorityProviders || []).length === 0 && <p className="text-sm text-slate-500 text-center py-2">Нет priority провайдеров</p>}
          </div>

          {/* Add Priority */}
          <div className="border-t border-slate-700 pt-4 space-y-2">
            <p className="text-xs text-slate-400 font-semibold">Дать Priority Access</p>
            <input value={prioritySlug} onChange={e => setPrioritySlug(e.target.value)} placeholder="slug провайдера" className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600" data-testid="priority-slug-input" />
            <div className="flex gap-2">
              <select value={priorityLevel} onChange={e => setPriorityLevel(Number(e.target.value))} className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600">
                <option value={1}>Level 1 (Priority)</option>
                <option value={2}>Level 2 (VIP)</option>
              </select>
              <input type="number" min="5" max="60" value={priorityWindow} onChange={e => setPriorityWindow(Number(e.target.value))} className="w-24 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600" placeholder="сек" />
            </div>
            <button onClick={handleGrantPriority} disabled={actionLoading} className="w-full bg-orange-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-orange-500 disabled:opacity-50" data-testid="priority-btn">Дать Priority</button>
          </div>
        </div>
      </div>

      {/* Distribution Config */}
      {distConfig && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-4">⚙️ Distribution Config</h2>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-slate-400">Priority Fanout</label>
              <input type="number" value={distConfig.priorityFanout || 3} onChange={e => setDistConfig({...distConfig, priorityFanout: Number(e.target.value)})} className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Normal Fanout</label>
              <input type="number" value={distConfig.normalFanout || 5} onChange={e => setDistConfig({...distConfig, normalFanout: Number(e.target.value)})} className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Priority Window (sec)</label>
              <input type="number" value={distConfig.priorityWindowSeconds || 20} onChange={e => setDistConfig({...distConfig, priorityWindowSeconds: Number(e.target.value)})} className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Max Promoted Top</label>
              <input type="number" value={distConfig.maxPromotedInTop || 3} onChange={e => setDistConfig({...distConfig, maxPromotedInTop: Number(e.target.value)})} className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 mt-1" />
            </div>
          </div>
          <button onClick={handleSaveDistConfig} className="mt-4 bg-blue-600 text-white text-sm font-bold px-6 py-2 rounded-lg hover:bg-blue-500" data-testid="save-dist-config">Сохранить</button>
        </div>
      )}

      {/* Recent Actions */}
      {data?.recentActions?.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-4">📋 Недавние действия</h2>
          <div className="space-y-2">
            {data.recentActions.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 bg-slate-700/30 rounded-lg p-3">
                <span className={`text-xs font-bold px-2 py-1 rounded ${a.type === 'promote' ? 'bg-amber-900/50 text-amber-300' : 'bg-orange-900/50 text-orange-300'}`}>
                  {a.type === 'promote' ? '⭐ PROMOTE' : '🔥 PRIORITY'}
                </span>
                <span className="text-sm text-white font-medium">{a.slug}</span>
                {a.boost && <span className="text-xs text-slate-400">boost: +{a.boost}</span>}
                {a.level && <span className="text-xs text-slate-400">level: {a.level}</span>}
                <span className="text-xs text-slate-500 ml-auto">{new Date(a.createdAt).toLocaleString('ru-RU')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
