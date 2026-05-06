import { useState, useEffect } from 'react';
import { FlaskConical, Plus, Play, Square, BarChart3, RefreshCw, Trophy, DollarSign } from 'lucide-react';
import { adminAPI } from '../services/api';

const typeLabels: Record<string, string> = {
  surge_threshold: 'Surge Threshold', distribution: 'Distribution', ttl: 'TTL', pricing: 'Pricing',
};

export default function RevenueExperimentsPage() {
  const [experiments, setExperiments] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'surge_threshold', zones: 'kyiv-center,kyiv-podil', variantAThreshold: '2.0', variantAMultiplier: '1.5', variantBThreshold: '2.5', variantBMultiplier: '1.7', durationHours: '24' });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getRevenueExperiments();
      setExperiments(res.data.experiments || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await adminAPI.createRevenueExperiment({
        name: form.name || 'Surge A/B Test', type: form.type,
        zones: form.zones.split(',').map(z => z.trim()),
        variants: [
          { name: 'A', config: { threshold: parseFloat(form.variantAThreshold), multiplier: parseFloat(form.variantAMultiplier) } },
          { name: 'B', config: { threshold: parseFloat(form.variantBThreshold), multiplier: parseFloat(form.variantBMultiplier) } },
        ],
        trafficSplit: [50, 50], durationHours: parseInt(form.durationHours),
      });
      setShowForm(false);
      loadData();
    } catch (err) { console.error(err); }
    finally { setCreating(false); }
  };

  const handleStart = async (id: string) => {
    await adminAPI.startRevenueExperiment(id);
    loadData();
  };

  const handleStop = async (id: string) => {
    await adminAPI.stopRevenueExperiment(id);
    loadData();
  };

  const loadResults = async (id: string) => {
    try {
      const res = await adminAPI.getExperimentResults(id);
      setResults(prev => ({ ...prev, [id]: res.data }));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><FlaskConical className="h-6 w-6 text-emerald-400" /> Revenue Experiments</h1>
          <p className="text-slate-400 mt-1">A/B тестирование surge и pricing</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 text-sm text-white">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить
          </button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 rounded-lg hover:bg-emerald-600 text-sm text-white font-semibold">
            <Plus className="h-4 w-4" /> Новый эксперимент
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-emerald-500/30">
          <h3 className="text-white font-semibold mb-4">Создать A/B эксперимент</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-sm">Название</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Surge Test Q1"
                className="w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-slate-400 text-sm">Тип</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                className="w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
                <option value="surge_threshold">Surge Threshold</option>
                <option value="distribution">Distribution</option>
                <option value="pricing">Pricing</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-sm">Зоны (через запятую)</label>
              <input value={form.zones} onChange={e => setForm({...form, zones: e.target.value})}
                className="w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-blue-400 font-semibold text-sm mb-2">Variant A</div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1"><label className="text-slate-400 text-[10px]">Threshold</label>
                    <input type="number" step="0.1" value={form.variantAThreshold} onChange={e => setForm({...form, variantAThreshold: e.target.value})}
                      className="w-full bg-slate-600 rounded px-2 py-1.5 text-white text-sm" /></div>
                  <div className="flex-1"><label className="text-slate-400 text-[10px]">Multiplier</label>
                    <input type="number" step="0.1" value={form.variantAMultiplier} onChange={e => setForm({...form, variantAMultiplier: e.target.value})}
                      className="w-full bg-slate-600 rounded px-2 py-1.5 text-white text-sm" /></div>
                </div>
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-emerald-400 font-semibold text-sm mb-2">Variant B</div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1"><label className="text-slate-400 text-[10px]">Threshold</label>
                    <input type="number" step="0.1" value={form.variantBThreshold} onChange={e => setForm({...form, variantBThreshold: e.target.value})}
                      className="w-full bg-slate-600 rounded px-2 py-1.5 text-white text-sm" /></div>
                  <div className="flex-1"><label className="text-slate-400 text-[10px]">Multiplier</label>
                    <input type="number" step="0.1" value={form.variantBMultiplier} onChange={e => setForm({...form, variantBMultiplier: e.target.value})}
                      className="w-full bg-slate-600 rounded px-2 py-1.5 text-white text-sm" /></div>
                </div>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Длительность (часы)</label>
              <input type="number" value={form.durationHours} onChange={e => setForm({...form, durationHours: e.target.value})}
                className="w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={handleCreate} disabled={creating}
                className="w-full px-4 py-2.5 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 disabled:opacity-50">
                {creating ? 'Создание...' : 'Создать эксперимент'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Experiments List */}
      {experiments.length === 0 && !loading ? (
        <div className="text-center py-12 text-slate-400">
          <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Нет экспериментов. Создайте первый!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {experiments.map(exp => (
            <div key={exp.id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">{exp.name || 'Experiment'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${exp.status === 'running' ? 'bg-green-500/20 text-green-400' : exp.status === 'stopped' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}`}>{exp.status}</span>
                      <span className="text-slate-500 text-xs">{typeLabels[exp.type] || exp.type}</span>
                    </div>
                    <div className="text-slate-400 text-xs mt-1">Зоны: {(exp.zones || []).join(', ')} • {exp.durationHours}ч • Split: {(exp.trafficSplit || []).join('/')}</div>
                  </div>
                  <div className="flex gap-2">
                    {exp.status === 'created' && (
                      <button onClick={() => handleStart(exp.id)} className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/30 flex items-center gap-1">
                        <Play className="h-3 w-3" /> Start
                      </button>
                    )}
                    {exp.status === 'running' && (
                      <button onClick={() => handleStop(exp.id)} className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 flex items-center gap-1">
                        <Square className="h-3 w-3" /> Stop
                      </button>
                    )}
                    <button onClick={() => loadResults(exp.id)} className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/30 flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" /> Results
                    </button>
                  </div>
                </div>
              </div>

              {/* Results */}
              {results[exp.id] && (
                <div className="border-t border-slate-700/50 p-5 bg-slate-900/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-yellow-400" />
                    <span className="text-white font-semibold text-sm">Winner: {results[exp.id].winner}</span>
                    <span className="text-slate-400 text-xs">({results[exp.id].winnerReason})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {(results[exp.id].results || []).map((r: any) => (
                      <div key={r.variant} className={`rounded-lg p-4 border ${r.variant === results[exp.id].winner ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-700/30 border-slate-700/50'}`}>
                        <div className={`font-bold text-sm mb-2 ${r.variant === results[exp.id].winner ? 'text-emerald-400' : 'text-slate-300'}`}>Variant {r.variant}</div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><div className="text-slate-400">GMV</div><div className="text-white font-bold">{(r.metrics.gmv / 1000).toFixed(0)}k грн</div></div>
                          <div><div className="text-slate-400">Conversion</div><div className="text-white font-bold">{r.metrics.conversionRate}%</div></div>
                          <div><div className="text-slate-400">Accept</div><div className="text-white font-bold">{r.metrics.acceptRate}%</div></div>
                          <div><div className="text-slate-400">Cancel</div><div className="text-white font-bold">{r.metrics.cancelRate}%</div></div>
                          <div><div className="text-slate-400">Avg ETA</div><div className="text-white font-bold">{r.metrics.avgEta} мин</div></div>
                          <div><div className="text-slate-400">Satisfaction</div><div className="text-white font-bold">{r.metrics.providerSatisfaction}%</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
