import { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { 
  Cpu, ToggleLeft, ToggleRight, Play, Pause, RefreshCw, AlertTriangle,
  FileText, Clock, CheckCircle, XCircle, ChevronRight, Settings,
  Zap, TrendingUp, Users, DollarSign, Send, Eye, EyeOff,
  Plus, Edit2, Trash2, Activity, Target, Radio, BarChart3,
  Brain, TrendingDown, Award, Beaker, LineChart
} from 'lucide-react';

interface Rule {
  _id: string;
  name: string;
  code: string;
  description?: string;
  category: string;
  priority: number;
  condition: {
    field: string;
    operator: string;
    value: any;
    value2?: any;
  };
  actions: Array<{
    type: string;
    params?: any;
    tunable?: boolean;
    paramRange?: { min: number; max: number; step?: number };
  }>;
  scope: string;
  cooldownSeconds: number;
  lastFiredAt?: string;
  isEnabled: boolean;
  learning?: {
    enabled: boolean;
    experimentMode: boolean;
    explorationRate: number;
  };
  createdAt: string;
}

interface Execution {
  _id: string;
  ruleCode: string;
  context: {
    zoneCode?: string;
    providerName?: string;
    fieldValue: any;
    trigger: string;
  };
  actionsExecuted: Array<{
    type: string;
    newValue: any;
    success: boolean;
    error?: string;
  }>;
  success: boolean;
  duration: number;
  createdAt: string;
  // Learning fields
  impact?: {
    matchRateChange: number;
    responseTimeChange: number;
    overallScore: number;
    isPositive: boolean;
  };
}

interface Stats {
  autoModeEnabled: boolean;
  totalRules: number;
  enabledRules: number;
  executionsLastHour: number;
  successRate: number;
}

interface LearningStats {
  totalExecutionsWithOutcome: number;
  positiveOutcomes: number;
  positiveRate: number;
  ruleEffectiveness: {
    excellent: number;
    good: number;
    neutral: number;
    poor: number;
    harmful: number;
  };
  marketHealth: {
    avgMatchRate: number;
    avgRatio: number;
    trend: string;
  };
}

interface RulePerformance {
  _id: string;
  ruleCode: string;
  effectivenessRating: string;
  avgOverallScore: number;
  avgMatchRateChange: number;
  totalExecutions: number;
  zonePerformance: Array<{
    zoneCode: string;
    avgScore: number;
    executions: number;
  }>;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  demand: { bg: 'bg-red-500/20', text: 'text-red-400' },
  distribution: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  supply: { bg: 'bg-green-500/20', text: 'text-green-400' },
  provider: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  pricing: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  visibility: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
};

const ACTION_ICONS: Record<string, any> = {
  set_surge: <DollarSign size={14} />,
  set_distribution_size: <Users size={14} />,
  set_ttl: <Clock size={14} />,
  set_visibility: <Eye size={14} />,
  set_commission: <DollarSign size={14} />,
  send_push: <Send size={14} />,
  expand_radius: <Target size={14} />,
  boost_providers: <TrendingUp size={14} />,
  limit_providers: <EyeOff size={14} />,
  log_alert: <AlertTriangle size={14} />,
};

const OPERATOR_LABELS: Record<string, string> = {
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  eq: '=',
  neq: '≠',
  in: 'in',
  between: 'between',
};

const EFFECTIVENESS_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  excellent: { bg: 'bg-green-500/20', text: 'text-green-400', icon: <Award size={14} /> },
  good: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', icon: <TrendingUp size={14} /> },
  neutral: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: <Activity size={14} /> },
  poor: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: <TrendingDown size={14} /> },
  harmful: { bg: 'bg-red-500/20', text: 'text-red-400', icon: <AlertTriangle size={14} /> },
};

export default function MarketControlPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [rulePerformance, setRulePerformance] = useState<RulePerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoMode, setAutoMode] = useState(true);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'executions' | 'learning'>('rules');

  const fetchData = useCallback(async () => {
    try {
      const [rulesRes, statsRes, executionsRes, learningRes, perfRes] = await Promise.all([
        adminAPI.getMarketRules(),
        adminAPI.getMarketStats(),
        adminAPI.getMarketExecutions({ limit: 30 }),
        adminAPI.getLearningStats(),
        adminAPI.getRulePerformance(),
      ]);
      setRules(rulesRes.data || []);
      setStats(statsRes.data || null);
      setExecutions(executionsRes.data || []);
      setLearningStats(learningRes.data || null);
      setRulePerformance(perfRes.data || []);
      setAutoMode(statsRes.data?.autoModeEnabled ?? true);
    } catch (err) {
      console.error('Failed to fetch market data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleAutoMode = async () => {
    try {
      await adminAPI.setMarketAutoMode({ enabled: !autoMode });
      setAutoMode(!autoMode);
    } catch (err) {
      console.error('Failed to toggle auto mode:', err);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    try {
      await adminAPI.toggleMarketRule(ruleId);
      fetchData();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await adminAPI.deleteMarketRule(ruleId);
      fetchData();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  // Group rules by category
  const rulesByCategory = rules.reduce((acc, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {} as Record<string, Rule[]>);

  return (
    <div className="p-6 h-full flex flex-col" data-testid="market-control-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
            <Cpu size={28} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Market Control</h1>
            <p className="text-slate-400 text-sm">Automated Self-Balancing System</p>
          </div>
        </div>
        
        {/* Auto Mode Toggle */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${
            autoMode 
              ? 'bg-green-500/20 border-green-500/50' 
              : 'bg-slate-700 border-slate-600'
          }`}>
            <span className={autoMode ? 'text-green-400' : 'text-slate-400'}>
              AUTO MODE
            </span>
            <button
              onClick={handleToggleAutoMode}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              data-testid="auto-mode-toggle"
            >
              {autoMode ? (
                <ToggleRight size={32} className="text-green-400" />
              ) : (
                <ToggleLeft size={32} className="text-slate-500" />
              )}
            </button>
          </div>
          
          <button
            onClick={fetchData}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg"
            data-testid="refresh-btn"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-6 gap-4 mb-6">
          <StatCard
            icon={<Activity className="text-purple-400" />}
            label="Auto Mode"
            value={stats.autoModeEnabled ? 'ON' : 'OFF'}
            color={stats.autoModeEnabled ? 'green' : 'slate'}
          />
          <StatCard
            icon={<FileText className="text-blue-400" />}
            label="Total Rules"
            value={stats.totalRules}
            sublabel={`${stats.enabledRules} enabled`}
            color="blue"
          />
          <StatCard
            icon={<Zap className="text-yellow-400" />}
            label="Executions (1h)"
            value={stats.executionsLastHour}
            color="yellow"
          />
          <StatCard
            icon={<CheckCircle className="text-green-400" />}
            label="Success Rate"
            value={`${stats.successRate}%`}
            color="green"
          />
          {learningStats && (
            <>
              <StatCard
                icon={<Brain className="text-pink-400" />}
                label="Learning Rate"
                value={`${learningStats.positiveRate}%`}
                sublabel={`${learningStats.positiveOutcomes}/${learningStats.totalExecutionsWithOutcome} positive`}
                color="pink"
              />
              <StatCard
                icon={<LineChart className="text-cyan-400" />}
                label="Market Health"
                value={learningStats.marketHealth.trend === 'healthy' ? 'Healthy' : 
                       learningStats.marketHealth.trend === 'moderate' ? 'Moderate' : 'Attention'}
                sublabel={`Match: ${learningStats.marketHealth.avgMatchRate.toFixed(1)}%`}
                color={learningStats.marketHealth.trend === 'healthy' ? 'green' : 
                       learningStats.marketHealth.trend === 'moderate' ? 'yellow' : 'red'}
              />
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-4 border-b border-slate-700">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Rules Engine
        </button>
        <button
          onClick={() => setActiveTab('executions')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'executions'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Execution Log
        </button>
        <button
          onClick={() => setActiveTab('learning')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'learning'
              ? 'border-pink-500 text-pink-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Brain size={16} />
          Self-Learning
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'rules' && (
          <div className="space-y-6">
            {Object.entries(rulesByCategory).map(([category, categoryRules]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${
                    CATEGORY_COLORS[category]?.bg || 'bg-slate-600'
                  } ${CATEGORY_COLORS[category]?.text || 'text-slate-300'}`}>
                    {category}
                  </span>
                  <span className="text-slate-500 text-sm">
                    {categoryRules.length} rule{categoryRules.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="space-y-2">
                  {categoryRules.sort((a, b) => b.priority - a.priority).map(rule => (
                    <RuleCard
                      key={rule._id}
                      rule={rule}
                      onToggle={() => handleToggleRule(rule._id)}
                      onDelete={() => handleDeleteRule(rule._id)}
                      onSelect={() => setSelectedRule(rule)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {rules.length === 0 && !loading && (
              <div className="text-center py-12">
                <Cpu size={48} className="text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No rules configured</p>
                <p className="text-slate-500 text-sm mt-1">Create rules to automate marketplace</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'executions' && (
          <div className="space-y-2">
            {executions.map(exec => (
              <ExecutionCard key={exec._id} execution={exec} />
            ))}

            {executions.length === 0 && !loading && (
              <div className="text-center py-12">
                <Activity size={48} className="text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No executions yet</p>
                <p className="text-slate-500 text-sm mt-1">Rules will execute when conditions are met</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'learning' && (
          <LearningPanel 
            stats={learningStats} 
            performance={rulePerformance}
            rules={rules}
          />
        )}
      </div>

      {/* Rule Detail Modal */}
      {selectedRule && (
        <RuleDetailModal
          rule={selectedRule}
          onClose={() => setSelectedRule(null)}
        />
      )}
    </div>
  );
}

function StatCard({ 
  icon, label, value, sublabel, color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  sublabel?: string;
  color: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 bg-${color}-500/20 rounded-lg`}>
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-white">{value}</p>
          <p className="text-slate-400 text-xs">{label}</p>
          {sublabel && <p className={`text-xs text-${color}-400`}>{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function RuleCard({ 
  rule, 
  onToggle, 
  onDelete, 
  onSelect 
}: { 
  rule: Rule;
  onToggle: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const colors = CATEGORY_COLORS[rule.category] || { bg: 'bg-slate-600', text: 'text-slate-300' };

  return (
    <div 
      className={`p-4 rounded-xl border transition-all ${
        rule.isEnabled 
          ? 'bg-slate-800 border-slate-700' 
          : 'bg-slate-800/50 border-slate-700/50 opacity-60'
      }`}
      data-testid={`rule-card-${rule.code}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 cursor-pointer" onClick={onSelect}>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-medium">{rule.name}</h3>
            <span className="text-slate-500 text-xs">#{rule.priority}</span>
          </div>
          
          {/* Condition Display */}
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <span className="text-cyan-400">IF</span>
            <code className="px-2 py-0.5 bg-slate-700 rounded text-xs">
              {rule.condition.field}
            </code>
            <span className="text-yellow-400">{OPERATOR_LABELS[rule.condition.operator]}</span>
            <code className="px-2 py-0.5 bg-slate-700 rounded text-xs">
              {JSON.stringify(rule.condition.value)}
            </code>
          </div>
          
          {/* Actions Display */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-purple-400 text-sm">THEN</span>
            {rule.actions.map((action, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300">
                {ACTION_ICONS[action.type] || <Zap size={12} />}
                {action.type.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          
          {/* Last fired */}
          {rule.lastFiredAt && (
            <p className="text-slate-500 text-xs mt-2">
              Last: {new Date(rule.lastFiredAt).toLocaleString()}
            </p>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              rule.isEnabled 
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
            title={rule.isEnabled ? 'Disable' : 'Enable'}
          >
            {rule.isEnabled ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExecutionCard({ execution }: { execution: Execution }) {
  return (
    <div className={`p-3 rounded-lg border ${
      execution.success 
        ? 'bg-slate-800 border-slate-700' 
        : 'bg-red-500/10 border-red-500/30'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {execution.success ? (
            <CheckCircle size={16} className="text-green-400" />
          ) : (
            <XCircle size={16} className="text-red-400" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-medium">{execution.ruleCode}</span>
              {execution.context.zoneCode && (
                <span className="text-slate-400 text-xs">→ {execution.context.zoneCode}</span>
              )}
              {execution.context.providerName && (
                <span className="text-slate-400 text-xs">→ {execution.context.providerName}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {execution.actionsExecuted.map((action, i) => (
                <span key={i} className={`px-2 py-0.5 rounded text-xs ${
                  action.success 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {action.type}: {typeof action.newValue === 'object' 
                    ? JSON.stringify(action.newValue).slice(0, 30) 
                    : action.newValue}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-xs">
            {execution.duration}ms
          </p>
          <p className="text-slate-500 text-xs">
            {new Date(execution.createdAt).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function RuleDetailModal({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-2xl w-full max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">{rule.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm">Code</label>
            <p className="text-white font-mono">{rule.code}</p>
          </div>
          
          <div>
            <label className="text-slate-400 text-sm">Description</label>
            <p className="text-white">{rule.description || 'No description'}</p>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-slate-400 text-sm">Category</label>
              <p className={CATEGORY_COLORS[rule.category]?.text}>{rule.category}</p>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Priority</label>
              <p className="text-white">{rule.priority}</p>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Cooldown</label>
              <p className="text-white">{rule.cooldownSeconds}s</p>
            </div>
          </div>
          
          <div>
            <label className="text-slate-400 text-sm">Condition</label>
            <pre className="bg-slate-900 p-3 rounded-lg text-sm text-cyan-400 overflow-auto">
              {JSON.stringify(rule.condition, null, 2)}
            </pre>
          </div>
          
          <div>
            <label className="text-slate-400 text-sm">Actions</label>
            <pre className="bg-slate-900 p-3 rounded-lg text-sm text-purple-400 overflow-auto">
              {JSON.stringify(rule.actions, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// Learning Panel Component
function LearningPanel({ 
  stats, 
  performance,
  rules,
}: { 
  stats: LearningStats | null;
  performance: RulePerformance[];
  rules: Rule[];
}) {
  if (!stats) {
    return (
      <div className="text-center py-12">
        <Brain size={48} className="text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">Loading learning data...</p>
      </div>
    );
  }

  // Build performance map
  const perfMap = new Map(performance.map(p => [p.ruleCode, p]));

  return (
    <div className="space-y-6">
      {/* Rule Effectiveness Distribution */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="text-white font-medium mb-4 flex items-center gap-2">
          <Brain className="text-pink-400" size={18} />
          Rule Effectiveness Distribution
        </h3>
        <div className="grid grid-cols-5 gap-4">
          {Object.entries(stats.ruleEffectiveness).map(([rating, count]) => {
            const colors = EFFECTIVENESS_COLORS[rating] || EFFECTIVENESS_COLORS.neutral;
            return (
              <div 
                key={rating}
                className={`p-4 rounded-xl border ${colors.bg} ${colors.text.replace('text-', 'border-').replace('-400', '-500/50')}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {colors.icon}
                  <span className="text-sm capitalize">{rating}</span>
                </div>
                <p className="text-2xl font-bold text-white">{count}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Market Health */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="text-white font-medium mb-4 flex items-center gap-2">
          <LineChart className="text-cyan-400" size={18} />
          Market Health
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-slate-400 text-sm">Average Match Rate</p>
            <p className="text-3xl font-bold text-white">{stats.marketHealth.avgMatchRate.toFixed(1)}%</p>
            <div className="h-2 bg-slate-700 rounded-full mt-2">
              <div 
                className="h-full bg-cyan-500 rounded-full transition-all"
                style={{ width: `${Math.min(stats.marketHealth.avgMatchRate, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Average Ratio</p>
            <p className="text-3xl font-bold text-white">{stats.marketHealth.avgRatio.toFixed(2)}</p>
            <p className={`text-sm ${stats.marketHealth.avgRatio > 2 ? 'text-red-400' : stats.marketHealth.avgRatio > 1 ? 'text-yellow-400' : 'text-green-400'}`}>
              {stats.marketHealth.avgRatio > 2 ? 'High demand' : stats.marketHealth.avgRatio > 1 ? 'Busy' : 'Balanced'}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">System Trend</p>
            <p className={`text-3xl font-bold ${
              stats.marketHealth.trend === 'healthy' ? 'text-green-400' :
              stats.marketHealth.trend === 'moderate' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {stats.marketHealth.trend === 'healthy' ? 'Healthy' :
               stats.marketHealth.trend === 'moderate' ? 'Moderate' : 'Needs Attention'}
            </p>
            <p className="text-slate-400 text-sm mt-1">Based on recent KPIs</p>
          </div>
        </div>
      </div>

      {/* Rule Performance Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="text-white font-medium mb-4 flex items-center gap-2">
          <BarChart3 className="text-purple-400" size={18} />
          Rule Performance Analysis
        </h3>
        
        {performance.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-400 text-sm border-b border-slate-700">
                  <th className="pb-2">Rule</th>
                  <th className="pb-2">Effectiveness</th>
                  <th className="pb-2">Avg Score</th>
                  <th className="pb-2">Match Rate Δ</th>
                  <th className="pb-2">Executions</th>
                </tr>
              </thead>
              <tbody>
                {performance.map(perf => {
                  const colors = EFFECTIVENESS_COLORS[perf.effectivenessRating] || EFFECTIVENESS_COLORS.neutral;
                  return (
                    <tr key={perf._id} className="border-b border-slate-700/50">
                      <td className="py-3 text-white font-medium">{perf.ruleCode}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${colors.bg} ${colors.text}`}>
                          {colors.icon}
                          {perf.effectivenessRating}
                        </span>
                      </td>
                      <td className={`py-3 font-bold ${perf.avgOverallScore > 0 ? 'text-green-400' : perf.avgOverallScore < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {perf.avgOverallScore > 0 ? '+' : ''}{perf.avgOverallScore.toFixed(1)}
                      </td>
                      <td className={`py-3 ${perf.avgMatchRateChange > 0 ? 'text-green-400' : perf.avgMatchRateChange < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {perf.avgMatchRateChange > 0 ? '+' : ''}{perf.avgMatchRateChange.toFixed(2)}%
                      </td>
                      <td className="py-3 text-slate-300">{perf.totalExecutions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <Beaker size={32} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400">No performance data yet</p>
            <p className="text-slate-500 text-sm">Rules need to execute and be measured first</p>
          </div>
        )}
      </div>

      {/* Rules with Learning Status */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="text-white font-medium mb-4 flex items-center gap-2">
          <Beaker className="text-yellow-400" size={18} />
          Rules Learning Status
        </h3>
        <div className="space-y-2">
          {rules.slice(0, 6).map(rule => {
            const perf = perfMap.get(rule.code);
            const colors = perf?.effectivenessRating 
              ? EFFECTIVENESS_COLORS[perf.effectivenessRating] 
              : EFFECTIVENESS_COLORS.neutral;
            
            return (
              <div 
                key={rule._id}
                className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${rule.isEnabled ? 'bg-green-500' : 'bg-slate-500'}`} />
                  <div>
                    <p className="text-white text-sm">{rule.name}</p>
                    <p className="text-slate-500 text-xs">{rule.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {rule.learning?.enabled && (
                    <span className="text-pink-400 text-xs flex items-center gap-1">
                      <Brain size={12} />
                      Learning
                    </span>
                  )}
                  {perf && (
                    <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${colors.bg} ${colors.text}`}>
                      {colors.icon}
                      {perf.avgOverallScore > 0 ? '+' : ''}{perf.avgOverallScore.toFixed(1)}
                    </span>
                  )}
                  {!perf && (
                    <span className="text-slate-500 text-xs">No data</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
