import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Star, AlertTriangle, Eye, EyeOff, Plus, Trash2, ChevronLeft, TrendingUp, TrendingDown, Flag, Award, XCircle } from 'lucide-react';
import { adminAPI } from '../services/api';

interface ReputationData {
  provider: {
    id: string;
    name: string;
    rating: number;
    reviewsCount: number;
    behavioralScore: number;
    behavioralTier: string;
    trustFlags: string[];
    penalties: any[];
  };
  reviews: {
    id: string;
    rating: number;
    comment: string;
    isHidden: boolean;
    createdAt: string;
  }[];
  reputationHistory: {
    id: string;
    actionType: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
    createdAt: string;
  }[];
}

const trustFlags = [
  { id: 'verified_documents', label: 'Документы проверены', color: 'bg-green-500/20 text-green-400' },
  { id: 'premium_partner', label: 'Премиум партнёр', color: 'bg-purple-500/20 text-purple-400' },
  { id: 'fast_responder', label: 'Быстрые ответы', color: 'bg-blue-500/20 text-blue-400' },
  { id: 'high_quality', label: 'Высокое качество', color: 'bg-amber-500/20 text-amber-400' },
  { id: 'new_provider', label: 'Новый мастер', color: 'bg-cyan-500/20 text-cyan-400' },
];

const penaltyTypes = [
  { id: 'warning', label: 'Предупреждение', severity: 10 },
  { id: 'score_reduction', label: 'Снижение score', severity: 20 },
  { id: 'suspension', label: 'Приостановка', severity: 50 },
];

export default function ReputationPage() {
  const { providerId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Forms
  const [ratingForm, setRatingForm] = useState({ newRating: 0, reason: '' });
  const [penaltyForm, setPenaltyForm] = useState({ type: 'warning', severity: 10, reason: '' });

  const loadData = async () => {
    if (!providerId) return;
    setLoading(true);
    try {
      const res = await adminAPI.getProviderReputation(providerId);
      setData(res.data);
      setRatingForm({ newRating: res.data.provider.rating, reason: '' });
    } catch (err) {
      console.error('Failed to load reputation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [providerId]);

  const handleAdjustRating = async () => {
    if (!providerId) return;
    setActionLoading(true);
    try {
      await adminAPI.adjustProviderRating(providerId, ratingForm);
      setShowRatingModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to adjust rating:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleHideReview = async (reviewId: string) => {
    const reason = prompt('Причина скрытия отзыва:');
    if (!reason) return;
    
    setActionLoading(true);
    try {
      await adminAPI.hideReviewReputation(reviewId, reason);
      loadData();
    } catch (err) {
      console.error('Failed to hide review:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddTrustFlag = async (flag: string) => {
    if (!providerId) return;
    setActionLoading(true);
    try {
      await adminAPI.addTrustFlag(providerId, flag);
      loadData();
    } catch (err) {
      console.error('Failed to add trust flag:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePenalize = async () => {
    if (!providerId) return;
    setActionLoading(true);
    try {
      await adminAPI.penalizeProvider(providerId, penaltyForm);
      setShowPenaltyModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to penalize:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-slate-900 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 bg-slate-900 min-h-screen">
        <div className="text-center text-slate-400">Provider not found</div>
      </div>
    );
  }

  const tierColors: Record<string, string> = {
    bronze: 'bg-orange-500/20 text-orange-400',
    silver: 'bg-slate-400/20 text-slate-300',
    gold: 'bg-yellow-500/20 text-yellow-400',
    platinum: 'bg-purple-500/20 text-purple-400',
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="p-2 bg-indigo-500/20 rounded-lg">
          <Shield className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Reputation Control</h1>
          <p className="text-sm text-slate-400">{data.provider.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Provider Info */}
        <div className="space-y-4">
          {/* Rating Card */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Рейтинг</h2>
              <button
                onClick={() => setShowRatingModal(true)}
                className="text-sm text-primary hover:underline"
              >
                Изменить
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold text-white">{data.provider.rating.toFixed(1)}</div>
              <div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${star <= Math.round(data.provider.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`}
                    />
                  ))}
                </div>
                <p className="text-slate-400 text-sm mt-1">{data.provider.reviewsCount} отзывов</p>
              </div>
            </div>
          </div>

          {/* Score Card */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Behavioral Score</h2>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-4xl font-bold text-white">{data.provider.behavioralScore}</div>
              <span className={`px-3 py-1 rounded-lg text-sm font-medium ${tierColors[data.provider.behavioralTier] || 'bg-slate-600'}`}>
                {data.provider.behavioralTier}
              </span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  data.provider.behavioralScore >= 80 ? 'bg-green-500' :
                  data.provider.behavioralScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${data.provider.behavioralScore}%` }}
              />
            </div>
          </div>

          {/* Trust Flags */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Trust Flags</h2>
            <div className="space-y-2">
              {trustFlags.map((flag) => {
                const hasFlag = data.provider.trustFlags?.includes(flag.id);
                return (
                  <div
                    key={flag.id}
                    className={`flex items-center justify-between p-2 rounded-lg ${hasFlag ? flag.color : 'bg-slate-700/50 text-slate-500'}`}
                  >
                    <div className="flex items-center gap-2">
                      {hasFlag ? <Award className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
                      <span className="text-sm">{flag.label}</span>
                    </div>
                    {!hasFlag && (
                      <button
                        onClick={() => handleAddTrustFlag(flag.id)}
                        className="p-1 hover:bg-slate-600 rounded text-slate-400"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Penalize Button */}
          <button
            onClick={() => setShowPenaltyModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors"
          >
            <XCircle className="w-5 h-5" />
            Применить штраф
          </button>
        </div>

        {/* Middle Column - Reviews */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Отзывы</h2>
          <div className="space-y-3 max-h-[600px] overflow-auto">
            {data.reviews.map((review) => (
              <div
                key={review.id}
                className={`p-3 rounded-lg ${review.isHidden ? 'bg-red-500/10 border border-red-500/30' : 'bg-slate-700/50'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3 h-3 ${star <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`}
                      />
                    ))}
                  </div>
                  {!review.isHidden ? (
                    <button
                      onClick={() => handleHideReview(review.id)}
                      className="p-1 hover:bg-slate-600 rounded text-slate-400"
                      title="Скрыть отзыв"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="text-xs text-red-400">Скрыт</span>
                  )}
                </div>
                <p className="text-slate-300 text-sm">{review.comment || 'Без комментария'}</p>
                <p className="text-slate-500 text-xs mt-2">
                  {new Date(review.createdAt).toLocaleDateString('ru-RU')}
                </p>
              </div>
            ))}
            {data.reviews.length === 0 && (
              <p className="text-slate-400 text-center">Нет отзывов</p>
            )}
          </div>
        </div>

        {/* Right Column - History */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">История изменений</h2>
          <div className="space-y-3 max-h-[600px] overflow-auto">
            {data.reputationHistory.map((action) => (
              <div key={action.id} className="p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    action.actionType === 'rating_adjust' ? 'bg-blue-500/20 text-blue-400' :
                    action.actionType === 'review_hide' ? 'bg-red-500/20 text-red-400' :
                    action.actionType === 'trust_flag' ? 'bg-green-500/20 text-green-400' :
                    'bg-orange-500/20 text-orange-400'
                  }`}>
                    {action.actionType.replace(/_/g, ' ')}
                  </span>
                </div>
                {action.reason && (
                  <p className="text-slate-300 text-sm">{action.reason}</p>
                )}
                {action.oldValue && action.newValue && (
                  <p className="text-slate-400 text-xs mt-1">
                    {JSON.stringify(action.oldValue)} → {JSON.stringify(action.newValue)}
                  </p>
                )}
                <p className="text-slate-500 text-xs mt-2">
                  {new Date(action.createdAt).toLocaleString('ru-RU')}
                </p>
              </div>
            ))}
            {data.reputationHistory.length === 0 && (
              <p className="text-slate-400 text-center">Нет истории</p>
            )}
          </div>
        </div>
      </div>

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Изменить рейтинг</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Новый рейтинг</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.1}
                  value={ratingForm.newRating}
                  onChange={(e) => setRatingForm({ ...ratingForm, newRating: parseFloat(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white text-2xl text-center"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Причина</label>
                <textarea
                  value={ratingForm.reason}
                  onChange={(e) => setRatingForm({ ...ratingForm, reason: e.target.value })}
                  rows={3}
                  placeholder="Объясните причину изменения..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowRatingModal(false)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
              >
                Отмена
              </button>
              <button
                onClick={handleAdjustRating}
                disabled={actionLoading || !ratingForm.reason}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Penalty Modal */}
      {showPenaltyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Применить штраф</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Тип штрафа</label>
                <div className="space-y-2">
                  {penaltyTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setPenaltyForm({ ...penaltyForm, type: type.id, severity: type.severity })}
                      className={`w-full p-3 rounded-lg text-left transition-colors ${
                        penaltyForm.type === type.id
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                          : 'bg-slate-700 hover:bg-slate-600 text-white'
                      }`}
                    >
                      <span className="font-medium">{type.label}</span>
                      <span className="text-sm text-slate-400 ml-2">(-{type.severity} score)</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Причина</label>
                <textarea
                  value={penaltyForm.reason}
                  onChange={(e) => setPenaltyForm({ ...penaltyForm, reason: e.target.value })}
                  rows={3}
                  placeholder="Объясните причину штрафа..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowPenaltyModal(false)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
              >
                Отмена
              </button>
              <button
                onClick={handlePenalize}
                disabled={actionLoading || !penaltyForm.reason}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Применение...' : 'Применить штраф'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
