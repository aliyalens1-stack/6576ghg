import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Sliders, Target, Clock, RotateCcw, Zap, Shield } from 'lucide-react';
import { adminAPI } from '../services/api';

interface DistributionConfig {
  providersPerRequest: number;
  ttl: number;
  retryCount: number;
  escalation: boolean;
  priorityFormula: {
    distance: number;
    score: number;
    rating: number;
    speed: number;
  };
  autoDistribute: boolean;
  maxRadius: number;
  minProviderScore: number;
}

export default function DistributionControlPage() {
  const [config, setConfig] = useState<DistributionConfig>({
    providersPerRequest: 5,
    ttl: 30,
    retryCount: 3,
    escalation: true,
    priorityFormula: { distance: 0.3, score: 0.3, rating: 0.2, speed: 0.2 },
    autoDistribute: true,
    maxRadius: 15,
    minProviderScore: 20,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getDistributionConfig();
      setConfig(res.data);
    } catch (err) {
      console.error('Failed to load distribution config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminAPI.updateDistributionConfig(config);
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<DistributionConfig>) => {
    setConfig({ ...config, ...patch });
    setHasChanges(true);
  };

  const updateFormula = (key: string, val: number) => {
    setConfig({ ...config, priorityFormula: { ...config.priorityFormula, [key]: val } });
    setHasChanges(true);
  };

  const formulaTotal = Object.values(config.priorityFormula).reduce((s, v) => s + v, 0);

  if (loading) {
    return (
      <div className="p-6 bg-slate-900 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-900 min-h-screen" data-testid="distribution-control-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/20 rounded-lg">
            <Settings className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Distribution Control</h1>
            <p className="text-sm text-slate-400">Управление алгоритмом распределения заявок</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm">
              Несохранённые изменения
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg"
            data-testid="save-distribution-config"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Core Settings */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Core Settings</h2>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300">Providers per request</span>
                <span className="text-white font-bold text-lg">{config.providersPerRequest}</span>
              </div>
              <input
                type="range"
                min={1} max={10}
                value={config.providersPerRequest}
                onChange={(e) => update({ providersPerRequest: parseInt(e.target.value) })}
                className="w-full accent-violet-500"
                data-testid="providers-per-request-slider"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1</span><span>10</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300">TTL (seconds)</span>
                </div>
                <span className="text-white font-bold text-lg">{config.ttl}s</span>
              </div>
              <input
                type="range"
                min={10} max={120}
                value={config.ttl}
                onChange={(e) => update({ ttl: parseInt(e.target.value) })}
                className="w-full accent-violet-500"
                data-testid="ttl-slider"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>10s</span><span>120s</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300">Retry count</span>
                </div>
                <span className="text-white font-bold text-lg">{config.retryCount}</span>
              </div>
              <input
                type="range"
                min={0} max={5}
                value={config.retryCount}
                onChange={(e) => update({ retryCount: parseInt(e.target.value) })}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>0</span><span>5</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300">Max radius (km)</span>
                </div>
                <span className="text-white font-bold text-lg">{config.maxRadius} km</span>
              </div>
              <input
                type="range"
                min={1} max={50}
                value={config.maxRadius}
                onChange={(e) => update({ maxRadius: parseInt(e.target.value) })}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1 km</span><span>50 km</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300">Min provider score</span>
                <span className="text-white font-bold text-lg">{config.minProviderScore}</span>
              </div>
              <input
                type="range"
                min={0} max={100}
                value={config.minProviderScore}
                onChange={(e) => update({ minProviderScore: parseInt(e.target.value) })}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>0</span><span>100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Priority Formula */}
        <div className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Priority Formula</h2>
              <span className={`ml-auto text-sm font-medium ${
                Math.abs(formulaTotal - 1) < 0.01 ? 'text-green-400' : 'text-red-400'
              }`}>
                Total: {formulaTotal.toFixed(1)}
              </span>
            </div>

            {Object.entries(config.priorityFormula).map(([key, val]) => (
              <div key={key} className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 capitalize">{key}</span>
                  <span className="text-white font-medium">{(val * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={Math.round(val * 100)}
                  onChange={(e) => updateFormula(key, parseInt(e.target.value) / 100)}
                  className="w-full accent-amber-500"
                  data-testid={`formula-${key}-slider`}
                />
              </div>
            ))}

            {Math.abs(formulaTotal - 1) > 0.01 && (
              <p className="text-red-400 text-sm mt-2">Сумма весов должна быть = 1.0</p>
            )}
          </div>

          {/* Toggles */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-white">Режимы</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white font-medium">Auto Distribute</span>
                  <p className="text-xs text-slate-400">Автоматическая раздача заявок</p>
                </div>
                <button
                  onClick={() => update({ autoDistribute: !config.autoDistribute })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    config.autoDistribute ? 'bg-cyan-500' : 'bg-slate-600'
                  }`}
                  data-testid="auto-distribute-toggle"
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    config.autoDistribute ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white font-medium">Escalation</span>
                  <p className="text-xs text-slate-400">Эскалация при неответе</p>
                </div>
                <button
                  onClick={() => update({ escalation: !config.escalation })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    config.escalation ? 'bg-cyan-500' : 'bg-slate-600'
                  }`}
                  data-testid="escalation-toggle"
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    config.escalation ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
