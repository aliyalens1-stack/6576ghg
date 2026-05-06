import { useState, useEffect } from 'react';
import { DollarSign, Percent, TrendingUp, Zap, Settings, Save, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { adminAPI } from '../services/api';

interface CommissionTier {
  tier: string;
  rate: number;
  minBookings: number;
}

interface SurgeRule {
  id: string;
  condition: string;
  multiplier: number;
  enabled: boolean;
}

interface PricingConfig {
  minPrice: number;
  dynamicPricing: boolean;
  emergencyMultiplier: number;
  peakHours: number[];
  peakMultiplier: number;
}

interface EconomyData {
  commissions: CommissionTier[];
  surgeRules: SurgeRule[];
  pricing: PricingConfig;
  bonuses: {
    newProvider: number;
    referral: number;
    peakHour: number;
  };
}

export default function EconomyControlPage() {
  const [data, setData] = useState<EconomyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Editable states
  const [commissions, setCommissions] = useState<CommissionTier[]>([]);
  const [surgeRules, setSurgeRules] = useState<SurgeRule[]>([]);
  const [pricing, setPricing] = useState<PricingConfig>({
    minPrice: 100,
    dynamicPricing: true,
    emergencyMultiplier: 2.0,
    peakHours: [8, 9, 17, 18, 19],
    peakMultiplier: 1.3,
  });
  const [bonuses, setBonuses] = useState({ newProvider: 500, referral: 200, peakHour: 50 });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getEconomyConfig();
      setData(res.data);
      setCommissions(res.data.commissions || [
        { tier: 'bronze', rate: 15, minBookings: 0 },
        { tier: 'silver', rate: 12, minBookings: 20 },
        { tier: 'gold', rate: 10, minBookings: 50 },
        { tier: 'platinum', rate: 8, minBookings: 100 },
      ]);
      setSurgeRules(res.data.surgeRules || [
        { id: '1', condition: 'ratio > 2', multiplier: 1.3, enabled: true },
        { id: '2', condition: 'ratio > 3', multiplier: 1.5, enabled: true },
        { id: '3', condition: 'ratio > 4', multiplier: 1.8, enabled: false },
      ]);
      setPricing(res.data.pricing || pricing);
      setBonuses(res.data.bonuses || bonuses);
    } catch (err) {
      console.error('Failed to load economy config:', err);
      // Set defaults
      setCommissions([
        { tier: 'bronze', rate: 15, minBookings: 0 },
        { tier: 'silver', rate: 12, minBookings: 20 },
        { tier: 'gold', rate: 10, minBookings: 50 },
        { tier: 'platinum', rate: 8, minBookings: 100 },
      ]);
      setSurgeRules([
        { id: '1', condition: 'ratio > 2', multiplier: 1.3, enabled: true },
        { id: '2', condition: 'ratio > 3', multiplier: 1.5, enabled: true },
        { id: '3', condition: 'ratio > 4', multiplier: 1.8, enabled: false },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminAPI.updateEconomyConfig({
        commissions,
        surgeRules,
        pricing,
        bonuses,
      });
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateCommission = (tier: string, rate: number) => {
    setCommissions(commissions.map(c => c.tier === tier ? { ...c, rate } : c));
    setHasChanges(true);
  };

  const toggleSurgeRule = (id: string) => {
    setSurgeRules(rules => rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    setHasChanges(true);
  };

  const updateSurgeMultiplier = (id: string, multiplier: number) => {
    setSurgeRules(rules => rules.map(r => r.id === id ? { ...r, multiplier } : r));
    setHasChanges(true);
  };

  const tierColors: Record<string, string> = {
    bronze: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    silver: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
    gold: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    platinum: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  if (loading) {
    return (
      <div className="p-6 bg-slate-900 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Economy Control</h1>
            <p className="text-sm text-slate-400">Управление деньгами — комиссии, surge, pricing</p>
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
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Commissions */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Комиссии по тирам</h2>
          </div>
          
          <div className="space-y-3">
            {commissions.map((tier) => (
              <div key={tier.tier} className={`p-3 rounded-lg border ${tierColors[tier.tier]}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium capitalize">{tier.tier}</span>
                    <p className="text-xs text-slate-400">от {tier.minBookings} заказов</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={tier.rate}
                      onChange={(e) => updateCommission(tier.tier, parseInt(e.target.value))}
                      className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center"
                      min={0}
                      max={50}
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Surge Rules */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-semibold text-white">Surge Rules</h2>
          </div>
          
          <div className="space-y-3">
            {surgeRules.map((rule) => (
              <div
                key={rule.id}
                className={`p-3 rounded-lg border transition-colors ${
                  rule.enabled 
                    ? 'bg-yellow-500/10 border-yellow-500/30' 
                    : 'bg-slate-700/50 border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <code className="text-sm text-yellow-300">{rule.condition}</code>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">Multiplier:</span>
                      <input
                        type="number"
                        value={rule.multiplier}
                        onChange={(e) => updateSurgeMultiplier(rule.id, parseFloat(e.target.value))}
                        className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-white text-center text-sm"
                        step={0.1}
                        min={1}
                        max={3}
                      />
                      <span className="text-xs text-slate-400">x</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSurgeRule(rule.id)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      rule.enabled ? 'bg-yellow-500' : 'bg-slate-600'
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

        {/* Pricing Config */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Pricing Config</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Минимальная цена</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={pricing.minPrice}
                  onChange={(e) => { setPricing({ ...pricing, minPrice: parseInt(e.target.value) }); setHasChanges(true); }}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center"
                />
                <span className="text-slate-400">₴</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Dynamic Pricing</span>
              <button
                onClick={() => { setPricing({ ...pricing, dynamicPricing: !pricing.dynamicPricing }); setHasChanges(true); }}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  pricing.dynamicPricing ? 'bg-cyan-500' : 'bg-slate-600'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  pricing.dynamicPricing ? 'left-5' : 'left-0.5'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Emergency Multiplier</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={pricing.emergencyMultiplier}
                  onChange={(e) => { setPricing({ ...pricing, emergencyMultiplier: parseFloat(e.target.value) }); setHasChanges(true); }}
                  className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center"
                  step={0.1}
                />
                <span className="text-slate-400">x</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Peak Hour Multiplier</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={pricing.peakMultiplier}
                  onChange={(e) => { setPricing({ ...pricing, peakMultiplier: parseFloat(e.target.value) }); setHasChanges(true); }}
                  className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center"
                  step={0.1}
                />
                <span className="text-slate-400">x</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bonuses */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">Бонусы</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Новый мастер</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bonuses.newProvider}
                  onChange={(e) => { setBonuses({ ...bonuses, newProvider: parseInt(e.target.value) }); setHasChanges(true); }}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center"
                />
                <span className="text-slate-400">₴</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Реферал</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bonuses.referral}
                  onChange={(e) => { setBonuses({ ...bonuses, referral: parseInt(e.target.value) }); setHasChanges(true); }}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center"
                />
                <span className="text-slate-400">₴</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Peak Hour Bonus</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bonuses.peakHour}
                  onChange={(e) => { setBonuses({ ...bonuses, peakHour: parseInt(e.target.value) }); setHasChanges(true); }}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center"
                />
                <span className="text-slate-400">₴</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
