import { useState, useEffect } from 'react';
import { GitBranch, Zap, ArrowRight, Filter, RefreshCw, CheckCircle, XCircle, Clock, Target } from 'lucide-react';
import api from '../services/api';

interface Rule {
  id: string;
  category: string;
  type: string;
  trigger: string;
  action: string;
  impact: Record<string, string>;
  enabled: boolean;
  executionCount: number;
  lastTriggered: string;
}

interface RulesData {
  rules: Rule[];
  categories: string[];
  summary: {
    totalRules: number;
    enabledRules: number;
    totalExecutions: number;
  };
}

export default function RuleVisualizerPage() {
  const [data, setData] = useState<RulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/rules/visualizer');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Quality Control': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'Pricing': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Distribution': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Incidents': 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return colors[category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, any> = {
      quality: Target,
      surge: Zap,
      distribution: GitBranch,
      escalation: ArrowRight,
      incident: Filter,
    };
    const Icon = icons[type] || GitBranch;
    return <Icon className="w-4 h-4" />;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffHours < 1) return 'Только что';
    if (diffHours < 24) return `${diffHours}ч назад`;
    return `${Math.floor(diffHours / 24)}д назад`;
  };

  const filteredRules = data?.rules.filter(r => 
    !selectedCategory || r.category === selectedCategory
  ) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="rule-visualizer-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg">
            <GitBranch className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Rule Engine Visualizer</h1>
            <p className="text-slate-400 text-sm">Rule → Trigger → Action → Impact</p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>

      {/* Summary */}
      {data?.summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-sm mb-1">Всего правил</div>
            <div className="text-2xl font-bold text-white">{data.summary.totalRules}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-sm mb-1">Активных</div>
            <div className="text-2xl font-bold text-green-400">{data.summary.enabledRules}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-sm mb-1">Всего срабатываний</div>
            <div className="text-2xl font-bold text-blue-400">{data.summary.totalExecutions.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !selectedCategory ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          Все
        </button>
        {data?.categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedCategory === cat ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Rules Flow */}
      <div className="space-y-4">
        {filteredRules.map((rule) => (
          <div
            key={rule.id}
            className={`bg-slate-800 rounded-xl p-4 border ${rule.enabled ? 'border-slate-700' : 'border-slate-700/50 opacity-60'}`}
          >
            <div className="flex items-start gap-4">
              {/* Category Badge */}
              <div className={`p-2 rounded-lg ${getCategoryColor(rule.category)}`}>
                {getTypeIcon(rule.type)}
              </div>

              {/* Rule Flow */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(rule.category)}`}>
                    {rule.category}
                  </span>
                  {rule.enabled ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <XCircle className="w-3 h-3" /> Disabled
                    </span>
                  )}
                </div>

                {/* Trigger → Action → Impact */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Trigger */}
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    <div className="text-xs text-amber-400 mb-1">TRIGGER</div>
                    <div className="text-white font-mono text-sm">{rule.trigger}</div>
                  </div>

                  <ArrowRight className="w-5 h-5 text-slate-600" />

                  {/* Action */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
                    <div className="text-xs text-blue-400 mb-1">ACTION</div>
                    <div className="text-white text-sm">{rule.action}</div>
                  </div>

                  <ArrowRight className="w-5 h-5 text-slate-600" />

                  {/* Impact */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                    <div className="text-xs text-green-400 mb-1">IMPACT</div>
                    <div className="flex gap-2">
                      {Object.entries(rule.impact).map(([key, value]) => (
                        <span key={key} className="text-sm">
                          <span className="text-slate-400">{key}:</span>{' '}
                          <span className={`font-medium ${String(value).startsWith('+') ? 'text-green-400' : String(value).startsWith('-') ? 'text-red-400' : 'text-white'}`}>
                            {value}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="text-right text-sm">
                <div className="text-slate-400">
                  <Clock className="w-4 h-4 inline mr-1" />
                  {formatDate(rule.lastTriggered)}
                </div>
                <div className="text-slate-500 mt-1">
                  {rule.executionCount} executions
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
