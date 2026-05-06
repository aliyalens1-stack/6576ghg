import { useState } from 'react';
import { Sparkles, Play, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info, RefreshCw } from 'lucide-react';
import api from '../services/api';

interface SimulationResult {
  input: {
    surgeMultiplier?: number;
    commissionRate?: number;
    providersPerRequest?: number;
    radius?: number;
  };
  baseline: {
    conversion: number;
    supply: number;
    revenue: number;
    complaints: number;
    avgETA: number;
  };
  predicted: {
    conversion: number;
    supply: number;
    revenue: number;
    complaints: number;
    avgETA: number;
  };
  delta: {
    conversion: string;
    supply: string;
    revenue: string;
    complaints: string;
    avgETA: string;
  };
  recommendation: string;
}

export default function SimulationPage() {
  const [params, setParams] = useState({
    surgeMultiplier: 1.0,
    commissionRate: 15,
    providersPerRequest: 5,
    radius: 15,
  });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await api.post('/admin/simulation/run', params);
      setResult(res.data);
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDeltaColor = (delta: string, invert = false) => {
    const isPositive = delta.startsWith('+') && !delta.includes('+0');
    const isNegative = delta.startsWith('-');
    
    if (invert) {
      return isPositive ? 'text-red-400' : isNegative ? 'text-green-400' : 'text-slate-400';
    }
    return isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-slate-400';
  };

  const getDeltaIcon = (delta: string, invert = false) => {
    const isPositive = delta.startsWith('+') && !delta.includes('+0');
    const isNegative = delta.startsWith('-');
    
    if (invert) {
      return isPositive ? <TrendingUp className="w-4 h-4 text-red-400" /> : 
             isNegative ? <TrendingDown className="w-4 h-4 text-green-400" /> : null;
    }
    return isPositive ? <TrendingUp className="w-4 h-4 text-green-400" /> : 
           isNegative ? <TrendingDown className="w-4 h-4 text-red-400" /> : null;
  };

  const getRecommendationStyle = (rec: string) => {
    if (rec.startsWith('RECOMMENDED')) return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' };
    if (rec.startsWith('WARNING')) return { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' };
    if (rec.startsWith('CAUTION')) return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    if (rec.startsWith('POSITIVE')) return { icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    return { icon: Info, color: 'text-slate-400', bg: 'bg-slate-500/10' };
  };

  return (
    <div className="space-y-6" data-testid="simulation-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
          <Sparkles className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Simulation Engine</h1>
          <p className="text-slate-400 text-sm">"Если поставить surge 1.5 → что будет?"</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Input Parameters */}
        <div className="bg-slate-800 rounded-xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            Параметры симуляции
          </h2>

          {/* Surge Multiplier */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-slate-400 text-sm">Surge Multiplier</label>
              <span className="text-white font-medium">{params.surgeMultiplier.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={params.surgeMultiplier}
              onChange={(e) => setParams({ ...params, surgeMultiplier: parseFloat(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0.5x</span>
              <span>1.5x</span>
              <span>3.0x</span>
            </div>
          </div>

          {/* Commission Rate */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-slate-400 text-sm">Комиссия платформы</label>
              <span className="text-white font-medium">{params.commissionRate}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="25"
              step="1"
              value={params.commissionRate}
              onChange={(e) => setParams({ ...params, commissionRate: parseInt(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>5%</span>
              <span>15%</span>
              <span>25%</span>
            </div>
          </div>

          {/* Providers Per Request */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-slate-400 text-sm">Мастеров на заявку</label>
              <span className="text-white font-medium">{params.providersPerRequest}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={params.providersPerRequest}
              onChange={(e) => setParams({ ...params, providersPerRequest: parseInt(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Radius */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-slate-400 text-sm">Радиус поиска (км)</label>
              <span className="text-white font-medium">{params.radius} км</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={params.radius}
              onChange={(e) => setParams({ ...params, radius: parseInt(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>5 км</span>
              <span>25 км</span>
              <span>50 км</span>
            </div>
          </div>

          <button
            onClick={runSimulation}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            data-testid="run-simulation-btn"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <>
                <Play className="w-5 h-5" />
                Запустить симуляцию
              </>
            )}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Conversion */}
                <div className="bg-slate-800 rounded-xl p-4">
                  <div className="text-slate-400 text-sm mb-2">Конверсия</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">{result.predicted.conversion}%</span>
                    <span className={`text-sm font-medium flex items-center gap-1 ${getDeltaColor(result.delta.conversion)}`}>
                      {getDeltaIcon(result.delta.conversion)}
                      {result.delta.conversion}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Было: {result.baseline.conversion}%</div>
                </div>

                {/* Supply */}
                <div className="bg-slate-800 rounded-xl p-4">
                  <div className="text-slate-400 text-sm mb-2">Предложение</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">{result.predicted.supply}</span>
                    <span className={`text-sm font-medium flex items-center gap-1 ${getDeltaColor(result.delta.supply)}`}>
                      {getDeltaIcon(result.delta.supply)}
                      {result.delta.supply}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Было: {result.baseline.supply}</div>
                </div>

                {/* Revenue */}
                <div className="bg-slate-800 rounded-xl p-4">
                  <div className="text-slate-400 text-sm mb-2">Доход</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">₽{result.predicted.revenue.toLocaleString()}</span>
                    <span className={`text-sm font-medium flex items-center gap-1 ${getDeltaColor(result.delta.revenue)}`}>
                      {getDeltaIcon(result.delta.revenue)}
                      {result.delta.revenue}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Было: ₽{result.baseline.revenue.toLocaleString()}</div>
                </div>

                {/* Complaints */}
                <div className="bg-slate-800 rounded-xl p-4">
                  <div className="text-slate-400 text-sm mb-2">Жалобы</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">{result.predicted.complaints}</span>
                    <span className={`text-sm font-medium flex items-center gap-1 ${getDeltaColor(result.delta.complaints, true)}`}>
                      {getDeltaIcon(result.delta.complaints, true)}
                      {result.delta.complaints}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Было: {result.baseline.complaints}</div>
                </div>

                {/* ETA */}
                <div className="bg-slate-800 rounded-xl p-4 col-span-2">
                  <div className="text-slate-400 text-sm mb-2">Среднее ETA</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">{result.predicted.avgETA} мин</span>
                    <span className={`text-sm font-medium flex items-center gap-1 ${getDeltaColor(result.delta.avgETA, true)}`}>
                      {getDeltaIcon(result.delta.avgETA, true)}
                      {result.delta.avgETA}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Было: {result.baseline.avgETA} мин</div>
                </div>
              </div>

              {/* Recommendation */}
              {result.recommendation && (
                <div className={`rounded-xl p-4 ${getRecommendationStyle(result.recommendation).bg}`}>
                  <div className="flex items-start gap-3">
                    {(() => {
                      const style = getRecommendationStyle(result.recommendation);
                      const Icon = style.icon;
                      return <Icon className={`w-5 h-5 mt-0.5 ${style.color}`} />;
                    })()}
                    <div>
                      <div className={`font-medium ${getRecommendationStyle(result.recommendation).color}`}>
                        Рекомендация
                      </div>
                      <div className="text-slate-300 text-sm mt-1">
                        {result.recommendation.split(': ')[1] || result.recommendation}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center">
              <Sparkles className="w-12 h-12 text-slate-600 mb-4" />
              <div className="text-slate-400">
                Настройте параметры и запустите симуляцию,<br />
                чтобы увидеть прогноз влияния на метрики
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
