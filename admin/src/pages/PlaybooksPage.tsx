import { useState, useEffect } from 'react';
import { BookOpen, Play, CheckCircle, Clock, AlertTriangle, Info, ChevronRight, RefreshCw } from 'lucide-react';
import api from '../services/api';

interface PlaybookStep {
  order: number;
  action: string;
  description: string;
  autoExecute: boolean;
}

interface Playbook {
  id: string;
  name: string;
  scenario: string;
  severity: string;
  steps: PlaybookStep[];
  estimatedResolutionTime: string;
  successRate: number;
  lastUsed: string;
  usageCount: number;
}

interface PlaybooksData {
  playbooks: Playbook[];
  categories: { id: string; name: string; count: number }[];
  stats: {
    totalPlaybooks: number;
    totalUsage: number;
    avgSuccessRate: number;
  };
}

export default function PlaybooksPage() {
  const [data, setData] = useState<PlaybooksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [executingStep, setExecutingStep] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/playbooks');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load playbooks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const executeStep = async (playbookId: string, stepOrder: number) => {
    setExecutingStep(stepOrder);
    try {
      await api.post(`/admin/playbooks/${playbookId}/execute-step`, { stepOrder });
      setCompletedSteps(prev => new Set([...prev, stepOrder]));
    } catch (err) {
      console.error('Failed to execute step:', err);
    } finally {
      setExecutingStep(null);
    }
  };

  const getSeverityStyle = (severity: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any }> = {
      critical: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertTriangle },
      high: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: AlertTriangle },
      warning: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: AlertTriangle },
      info: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Info },
    };
    return styles[severity] || styles.info;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="playbooks-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-lg">
            <BookOpen className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Operator Playbooks</h1>
            <p className="text-slate-400 text-sm">Пошаговые инструкции для операторов</p>
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

      {/* Stats */}
      {data?.stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-sm mb-1">Всего плейбуков</div>
            <div className="text-2xl font-bold text-white">{data.stats.totalPlaybooks}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-sm mb-1">Использований</div>
            <div className="text-2xl font-bold text-blue-400">{data.stats.totalUsage}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-sm mb-1">Успешность</div>
            <div className="text-2xl font-bold text-green-400">{data.stats.avgSuccessRate}%</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Playbooks List */}
        <div className="col-span-1 space-y-3">
          <h2 className="text-sm font-medium text-slate-400 uppercase">Сценарии</h2>
          {data?.playbooks.map((pb) => {
            const style = getSeverityStyle(pb.severity);
            const Icon = style.icon;
            return (
              <button
                key={pb.id}
                onClick={() => {
                  setSelectedPlaybook(pb);
                  setCompletedSteps(new Set());
                }}
                className={`w-full text-left p-4 rounded-xl transition-colors ${
                  selectedPlaybook?.id === pb.id
                    ? 'bg-slate-700 border border-slate-600'
                    : 'bg-slate-800 hover:bg-slate-700/50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${style.bg}`}>
                    <Icon className={`w-4 h-4 ${style.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{pb.name}</div>
                    <div className="text-slate-400 text-sm">{pb.steps.length} шагов</div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                      <span>{pb.usageCount} uses</span>
                      <span>•</span>
                      <span>{pb.successRate}% success</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Playbook Details */}
        <div className="col-span-2">
          {selectedPlaybook ? (
            <div className="bg-slate-800 rounded-xl p-6">
              {/* Playbook Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityStyle(selectedPlaybook.severity).bg} ${getSeverityStyle(selectedPlaybook.severity).text}`}>
                      {selectedPlaybook.severity.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{selectedPlaybook.name}</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Ожидаемое время: {selectedPlaybook.estimatedResolutionTime}
                  </p>
                </div>
                <div className="text-right text-sm text-slate-400">
                  <div>Последнее использование</div>
                  <div className="text-white">{formatDate(selectedPlaybook.lastUsed)}</div>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-400 uppercase">Шаги выполнения</h3>
                {selectedPlaybook.steps.map((step) => {
                  const isCompleted = completedSteps.has(step.order);
                  const isExecuting = executingStep === step.order;
                  
                  return (
                    <div
                      key={step.order}
                      className={`flex items-center gap-4 p-4 rounded-lg border ${
                        isCompleted
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-slate-700/50 border-slate-600'
                      }`}
                    >
                      {/* Step Number */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        isCompleted ? 'bg-green-500 text-white' : 'bg-slate-600 text-slate-300'
                      }`}>
                        {isCompleted ? <CheckCircle className="w-5 h-5" /> : step.order}
                      </div>

                      {/* Step Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{step.description}</span>
                          {step.autoExecute && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                              AUTO
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 text-sm mt-1">
                          Action: <code className="bg-slate-800 px-1 rounded">{step.action}</code>
                        </div>
                      </div>

                      {/* Execute Button */}
                      {!isCompleted && (
                        <button
                          onClick={() => executeStep(selectedPlaybook.id, step.order)}
                          disabled={isExecuting}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isExecuting ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Execute
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress */}
              <div className="mt-6 pt-6 border-t border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Прогресс</span>
                  <span className="text-white font-medium">
                    {completedSteps.size} / {selectedPlaybook.steps.length} шагов
                  </span>
                </div>
                <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${(completedSteps.size / selectedPlaybook.steps.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center h-full">
              <BookOpen className="w-12 h-12 text-slate-600 mb-4" />
              <div className="text-slate-400">
                Выберите плейбук слева,<br />
                чтобы увидеть пошаговые инструкции
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
