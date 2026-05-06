import { useState, useEffect } from 'react';
import { Lightbulb, AlertTriangle, Clock, TrendingDown, Users, Zap, Send, RefreshCw, Check, X, ChevronRight, Target } from 'lucide-react';
import { adminAPI } from '../services/api';

interface Suggestion {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  actions: {
    id: string;
    label: string;
    color: string;
  }[];
}

const severityColors: Record<string, { bg: string; border: string; icon: string }> = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400' },
  warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: 'text-yellow-400' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400' },
};

const typeIcons: Record<string, any> = {
  provider_low_performance: TrendingDown,
  overdue_dispute: AlertTriangle,
  stuck_booking: Clock,
  quote_no_response: Users,
  inactive_top_provider: Zap,
};

const actionColors: Record<string, string> = {
  red: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
  orange: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  green: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
  blue: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  purple: 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30',
};

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [executedActions, setExecutedActions] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getSuggestions();
      setSuggestions(res.data.suggestions || []);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
    // Refresh every 30 seconds
    const interval = setInterval(loadSuggestions, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleExecuteAction = async (suggestionId: string, actionId: string) => {
    setExecuting(`${suggestionId}-${actionId}`);
    try {
      await adminAPI.executeSuggestionAction(suggestionId, actionId);
      setExecutedActions([...executedActions, `${suggestionId}-${actionId}`]);
      // Remove the suggestion after successful action
      setTimeout(() => {
        setSuggestions(suggestions.filter(s => s.id !== suggestionId));
      }, 1500);
    } catch (err) {
      console.error('Failed to execute action:', err);
    } finally {
      setExecuting(null);
    }
  };

  const filteredSuggestions = filter === 'all' 
    ? suggestions 
    : suggestions.filter(s => s.severity === filter);

  const criticalCount = suggestions.filter(s => s.severity === 'critical').length;
  const warningCount = suggestions.filter(s => s.severity === 'warning').length;
  const infoCount = suggestions.filter(s => s.severity === 'info').length;

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Lightbulb className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Smart Suggestions</h1>
            <p className="text-sm text-slate-400">Система рекомендует действия на основе анализа</p>
          </div>
        </div>
        
        <button
          onClick={loadSuggestions}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`p-4 rounded-xl border transition-colors ${
            filter === 'all' ? 'bg-slate-700 border-slate-600' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Target className="w-4 h-4" />
            <span className="text-sm">Всего</span>
          </div>
          <span className="text-2xl font-bold text-white">{suggestions.length}</span>
        </button>
        <button
          onClick={() => setFilter('critical')}
          className={`p-4 rounded-xl border transition-colors ${
            filter === 'critical' ? 'bg-red-500/20 border-red-500/30' : 'bg-slate-800 border-slate-700 hover:border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-2 text-red-400 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Critical</span>
          </div>
          <span className="text-2xl font-bold text-red-400">{criticalCount}</span>
        </button>
        <button
          onClick={() => setFilter('warning')}
          className={`p-4 rounded-xl border transition-colors ${
            filter === 'warning' ? 'bg-yellow-500/20 border-yellow-500/30' : 'bg-slate-800 border-slate-700 hover:border-yellow-500/30'
          }`}
        >
          <div className="flex items-center gap-2 text-yellow-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Warning</span>
          </div>
          <span className="text-2xl font-bold text-yellow-400">{warningCount}</span>
        </button>
        <button
          onClick={() => setFilter('info')}
          className={`p-4 rounded-xl border transition-colors ${
            filter === 'info' ? 'bg-blue-500/20 border-blue-500/30' : 'bg-slate-800 border-slate-700 hover:border-blue-500/30'
          }`}
        >
          <div className="flex items-center gap-2 text-blue-400 mb-1">
            <Lightbulb className="w-4 h-4" />
            <span className="text-sm">Info</span>
          </div>
          <span className="text-2xl font-bold text-blue-400">{infoCount}</span>
        </button>
      </div>

      {/* Suggestions List */}
      {loading && suggestions.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
          <p className="text-slate-400 mt-2">Анализируем систему...</p>
        </div>
      ) : filteredSuggestions.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <Check className="w-12 h-12 text-green-400 mx-auto mb-2" />
          <p className="text-white font-medium">Всё в порядке!</p>
          <p className="text-slate-400 text-sm mt-1">Нет рекомендуемых действий</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSuggestions.map((suggestion) => {
            const Icon = typeIcons[suggestion.type] || Lightbulb;
            const colors = severityColors[suggestion.severity];
            const isExecuted = executedActions.some(a => a.startsWith(suggestion.id));

            return (
              <div
                key={suggestion.id}
                className={`rounded-xl border p-4 transition-all ${colors.bg} ${colors.border} ${
                  isExecuted ? 'opacity-50 scale-98' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.icon}`} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium">{suggestion.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${
                        suggestion.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        suggestion.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {suggestion.severity}
                      </span>
                      <span className="text-slate-500 text-xs">
                        #{suggestion.entityId.slice(-6)}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">{suggestion.description}</p>
                    
                    {/* Action Buttons */}
                    {!isExecuted && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {suggestion.actions.map((action) => {
                          const isExecuting = executing === `${suggestion.id}-${action.id}`;
                          const wasExecuted = executedActions.includes(`${suggestion.id}-${action.id}`);
                          
                          return (
                            <button
                              key={action.id}
                              onClick={() => handleExecuteAction(suggestion.id, action.id)}
                              disabled={isExecuting || wasExecuted}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                wasExecuted 
                                  ? 'bg-green-500/20 text-green-400' 
                                  : actionColors[action.color] || actionColors.blue
                              }`}
                            >
                              {isExecuting ? (
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : wasExecuted ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              {action.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    
                    {isExecuted && (
                      <div className="flex items-center gap-2 mt-3 text-green-400">
                        <Check className="w-4 h-4" />
                        <span className="text-sm">Действие выполнено</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
