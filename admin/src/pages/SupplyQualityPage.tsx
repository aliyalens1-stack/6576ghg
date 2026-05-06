import { useState, useEffect } from 'react';
import { Users, TrendingUp, TrendingDown, AlertTriangle, Skull, Clock, Zap, EyeOff, Send, Power, Settings, Filter, RefreshCw, ChevronRight, Award } from 'lucide-react';
import { adminAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface ProviderQuality {
  id: string;
  name: string;
  rating: number;
  behavioralScore: number;
  behavioralTier: string;
  responseTime: number;
  acceptanceRate: number;
  completionRate: number;
  earnings: number;
  isOnline: boolean;
  lastActiveAt: string;
  segment: 'top' | 'good' | 'risky' | 'slow' | 'dead';
}

interface AutoRule {
  id: string;
  condition: string;
  action: string;
  enabled: boolean;
}

const segmentConfig = {
  top: { label: 'Top Performers', icon: Award, color: 'bg-green-500/20 text-green-400 border-green-500/30', badgeColor: 'bg-green-500' },
  good: { label: 'Good', icon: TrendingUp, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', badgeColor: 'bg-blue-500' },
  risky: { label: 'Risky', icon: AlertTriangle, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', badgeColor: 'bg-orange-500' },
  slow: { label: 'Slow Responders', icon: Clock, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', badgeColor: 'bg-yellow-500' },
  dead: { label: 'Dead Supply', icon: Skull, color: 'bg-red-500/20 text-red-400 border-red-500/30', badgeColor: 'bg-red-500' },
};

export default function SupplyQualityPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderQuality[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  
  const [autoRules, setAutoRules] = useState<AutoRule[]>([
    { id: '1', condition: 'response_time > 120s', action: 'limit_visibility', enabled: true },
    { id: '2', condition: 'acceptance_rate < 30%', action: 'limit_visibility', enabled: true },
    { id: '3', condition: 'rating > 4.8 AND completions > 50', action: 'boost', enabled: false },
    { id: '4', condition: 'inactive > 7 days', action: 'force_offline', enabled: true },
  ]);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getSupplyQuality();
      setProviders(res.data.providers || []);
    } catch (err) {
      console.error('Failed to load supply quality:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleAction = async (providerId: string, action: string) => {
    setActionLoading(`${providerId}-${action}`);
    try {
      await adminAPI.executeQualityAction(providerId, action);
      loadProviders();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkAction = async (action: string) => {
    setActionLoading(`bulk-${action}`);
    try {
      for (const id of selectedProviders) {
        await adminAPI.executeQualityAction(id, action);
      }
      setSelectedProviders([]);
      loadProviders();
    } catch (err) {
      console.error('Bulk action failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleRule = (ruleId: string) => {
    setAutoRules(rules => 
      rules.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r)
    );
  };

  // Calculate segment counts
  const segmentCounts = providers.reduce((acc, p) => {
    acc[p.segment] = (acc[p.segment] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredProviders = selectedSegment 
    ? providers.filter(p => p.segment === selectedSegment)
    : providers;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <Users className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Supply Quality Control</h1>
            <p className="text-sm text-slate-400">Фильтр качества рынка — управление мастерами</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRulesPanel(!showRulesPanel)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              showRulesPanel ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Settings className="w-4 h-4" />
            Auto Rules
          </button>
          <button
            onClick={loadProviders}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Auto Rules Panel */}
      {showRulesPanel && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-6">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" />
            Auto Quality Rules
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {autoRules.map((rule) => (
              <div
                key={rule.id}
                className={`p-3 rounded-lg border transition-colors ${
                  rule.enabled 
                    ? 'bg-slate-800 border-purple-500/50' 
                    : 'bg-slate-800/50 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <code className="text-sm text-purple-300">{rule.condition}</code>
                    <p className="text-xs text-slate-400 mt-1">→ {rule.action.replace(/_/g, ' ')}</p>
                  </div>
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      rule.enabled ? 'bg-purple-500' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      rule.enabled ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Segment Filters */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {Object.entries(segmentConfig).map(([segment, config]) => {
          const Icon = config.icon;
          const count = segmentCounts[segment] || 0;
          const isSelected = selectedSegment === segment;
          
          return (
            <button
              key={segment}
              onClick={() => setSelectedSegment(isSelected ? null : segment)}
              className={`p-4 rounded-xl border transition-all ${
                isSelected ? config.color : 'bg-slate-800 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 ${isSelected ? '' : 'text-slate-400'}`} />
                <span className={`text-sm font-medium ${isSelected ? '' : 'text-slate-300'}`}>
                  {config.label}
                </span>
              </div>
              <div className="text-2xl font-bold text-white">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Bulk Actions Bar */}
      {selectedProviders.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 shadow-xl flex items-center gap-4 z-50">
          <span className="text-white font-medium">{selectedProviders.length} выбрано</span>
          <div className="h-6 w-px bg-slate-600" />
          <button
            onClick={() => handleBulkAction('boost')}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm"
          >
            <Zap className="w-4 h-4" />
            Auto Boost
          </button>
          <button
            onClick={() => handleBulkAction('limit')}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg text-sm"
          >
            <EyeOff className="w-4 h-4" />
            Auto Limit
          </button>
          <button
            onClick={() => handleBulkAction('send_training')}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm"
          >
            <Send className="w-4 h-4" />
            Send Training
          </button>
          <button
            onClick={() => handleBulkAction('force_offline')}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm"
          >
            <Power className="w-4 h-4" />
            Force Offline
          </button>
          <button
            onClick={() => setSelectedProviders([])}
            className="text-slate-400 hover:text-white text-sm"
          >
            Отмена
          </button>
        </div>
      )}

      {/* Providers Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedProviders.length === filteredProviders.length && filteredProviders.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedProviders(filteredProviders.map(p => p.id));
                    } else {
                      setSelectedProviders([]);
                    }
                  }}
                  className="rounded bg-slate-700 border-slate-600 text-primary"
                />
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Мастер</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Segment</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Score</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Response</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Accept %</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Complete %</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Earnings</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Загрузка...</td>
              </tr>
            ) : filteredProviders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Нет мастеров</td>
              </tr>
            ) : (
              filteredProviders.map((provider) => {
                const segConfig = segmentConfig[provider.segment];
                return (
                  <tr key={provider.id} className="hover:bg-slate-750">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedProviders.includes(provider.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProviders([...selectedProviders, provider.id]);
                          } else {
                            setSelectedProviders(selectedProviders.filter(id => id !== provider.id));
                          }
                        }}
                        className="rounded bg-slate-700 border-slate-600 text-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${provider.isOnline ? 'bg-green-400' : 'bg-slate-500'}`} />
                        <div>
                          <span className="text-white font-medium">{provider.name}</span>
                          <p className="text-slate-500 text-xs">Rating: {provider.rating.toFixed(1)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${segConfig.color}`}>
                        {segConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{provider.behavioralScore}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          provider.behavioralTier === 'gold' ? 'bg-yellow-500/20 text-yellow-400' :
                          provider.behavioralTier === 'platinum' ? 'bg-purple-500/20 text-purple-400' :
                          provider.behavioralTier === 'silver' ? 'bg-slate-400/20 text-slate-300' :
                          'bg-orange-500/20 text-orange-400'
                        }`}>
                          {provider.behavioralTier}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${
                        provider.responseTime > 120 ? 'text-red-400' :
                        provider.responseTime > 60 ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {formatTime(provider.responseTime)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${
                        provider.acceptanceRate < 30 ? 'text-red-400' :
                        provider.acceptanceRate < 60 ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {provider.acceptanceRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${
                        provider.completionRate < 70 ? 'text-red-400' :
                        provider.completionRate < 90 ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {provider.completionRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">
                      ₴{(provider.earnings || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleAction(provider.id, 'boost')}
                          disabled={actionLoading !== null}
                          className="p-1.5 hover:bg-green-500/20 rounded text-green-400"
                          title="Boost"
                        >
                          <Zap size={14} />
                        </button>
                        <button
                          onClick={() => handleAction(provider.id, 'limit')}
                          disabled={actionLoading !== null}
                          className="p-1.5 hover:bg-orange-500/20 rounded text-orange-400"
                          title="Limit"
                        >
                          <EyeOff size={14} />
                        </button>
                        <button
                          onClick={() => handleAction(provider.id, 'send_training')}
                          disabled={actionLoading !== null}
                          className="p-1.5 hover:bg-blue-500/20 rounded text-blue-400"
                          title="Training"
                        >
                          <Send size={14} />
                        </button>
                        <button
                          onClick={() => navigate(`/providers/${provider.id}/reputation`)}
                          className="p-1.5 hover:bg-slate-600 rounded text-slate-400"
                          title="Reputation"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
