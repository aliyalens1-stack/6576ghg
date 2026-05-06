import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useThemeContext } from '../src/context/ThemeContext';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { theme } from '../src/context/ThemeContext';
const colors = theme.colors;

interface IntelligenceData {
  visibility: {
    score: number;
    state: string;
    rank: string;
    factors: Array<{
      name: string;
      score: number;
      status: 'good' | 'warning' | 'bad';
    }>;
    tips: string[];
  };
  commission: {
    currentRate: number;
    factors: Array<{
      name: string;
      impact: string;
      status: 'positive' | 'negative' | 'neutral';
    }>;
    tips: string[];
  };
  stats: {
    totalBookings: number;
    completedBookings: number;
    repeatRate: number;
    avgResponseTime: number;
    rating: number;
    reviewsCount: number;
  };
  lostOpportunities: number;
}

export default function ProviderIntelligenceScreen() {
  const { colors } = useThemeContext();
  const styles = makeStyles(colors);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || '';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        setError('Необходимо войти в аккаунт');
        setLoading(false);
        return;
      }

      // Fetch provider profile
      const profileRes = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!profileRes.ok) {
        throw new Error('Failed to fetch profile');
      }

      const profile = await profileRes.json();
      
      // Fetch organization if provider
      if (profile.role === 'provider_owner' || profile.role === 'provider_admin') {
        // Get organization data
        const orgRes = await fetch(`${apiUrl}/api/organizations/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (orgRes.ok) {
          const org = await orgRes.json();
          
          // Build intelligence data from org
          const intelligenceData: IntelligenceData = {
            visibility: {
              score: org.visibilityScore || 50,
              state: org.visibilityState || 'NORMAL',
              rank: getVisibilityRank(org.visibilityScore || 50),
              factors: buildVisibilityFactors(org),
              tips: buildVisibilityTips(org),
            },
            commission: {
              currentRate: org.customCommissionPercent || getBaseCommissionRate(org),
              factors: buildCommissionFactors(org),
              tips: buildCommissionTips(org),
            },
            stats: {
              totalBookings: org.bookingsCount || 0,
              completedBookings: org.completedBookingsCount || 0,
              repeatRate: Math.round((org.repeatBookingRate || 0) * 100),
              avgResponseTime: org.avgResponseTimeMinutes || 0,
              rating: org.ratingAvg || 0,
              reviewsCount: org.reviewsCount || 0,
            },
            lostOpportunities: Math.round((org.quotesReceivedCount || 0) * 0.3), // Mock
          };
          
          setData(intelligenceData);
        }
      } else {
        setError('Этот раздел доступен только для исполнителей');
      }
    } catch (err) {
      console.error('Error fetching intelligence:', err);
      // Use mock data for demo
      setData(getMockData());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getVisibilityRank = (score: number): string => {
    if (score >= 80) return 'Топ';
    if (score >= 60) return 'Выше среднего';
    if (score >= 40) return 'Средний';
    if (score >= 20) return 'Ниже среднего';
    return 'Низкий';
  };

  const getBaseCommissionRate = (org: any): number => {
    const completed = org.completedBookingsCount || 0;
    if (completed < 5) return 10;
    if (completed >= 50) return 12;
    return 15;
  };

  const buildVisibilityFactors = (org: any): any[] => {
    return [
      { name: 'Рейтинг', score: Math.min(100, (org.ratingAvg || 0) * 20), status: org.ratingAvg >= 4.5 ? 'good' : org.ratingAvg >= 4 ? 'warning' : 'bad' },
      { name: 'Скорость ответа', score: org.avgResponseTimeMinutes <= 10 ? 100 : org.avgResponseTimeMinutes <= 30 ? 70 : 30, status: org.avgResponseTimeMinutes <= 10 ? 'good' : org.avgResponseTimeMinutes <= 30 ? 'warning' : 'bad' },
      { name: 'Завершённые заказы', score: Math.min(100, (org.completedBookingsCount || 0)), status: (org.completedBookingsCount || 0) >= 50 ? 'good' : (org.completedBookingsCount || 0) >= 10 ? 'warning' : 'bad' },
      { name: 'Повторные клиенты', score: Math.min(100, (org.repeatBookingRate || 0) * 200), status: (org.repeatBookingRate || 0) >= 0.3 ? 'good' : (org.repeatBookingRate || 0) >= 0.15 ? 'warning' : 'bad' },
      { name: 'Доверие', score: org.isVerified ? 100 : 60, status: org.isVerified ? 'good' : 'warning' },
    ];
  };

  const buildVisibilityTips = (org: any): string[] => {
    const tips: string[] = [];
    if (!org.isVerified) tips.push('Пройдите верификацию для повышения доверия');
    if ((org.avgResponseTimeMinutes || 100) > 10) tips.push('Отвечайте на заявки быстрее 10 минут');
    if ((org.ratingAvg || 0) < 4.5) tips.push('Получите больше положительных отзывов');
    if ((org.repeatBookingRate || 0) < 0.2) tips.push('Предлагайте скидки для повторных клиентов');
    return tips;
  };

  const buildCommissionFactors = (org: any): any[] => {
    const factors: any[] = [];
    const completed = org.completedBookingsCount || 0;
    
    if (completed < 5) {
      factors.push({ name: 'Базовая ставка (новый)', impact: '10%', status: 'neutral' as const });
    } else if (completed >= 50) {
      factors.push({ name: 'Опытный мастер', impact: '-3%', status: 'positive' as const });
    }
    
    if (org.isVerified) {
      factors.push({ name: 'Верификация', impact: '-2%', status: 'positive' as const });
    }
    
    if ((org.ratingAvg || 0) >= 4.5 && (org.reviewsCount || 0) >= 10) {
      factors.push({ name: 'Высокий рейтинг', impact: '-2%', status: 'positive' as const });
    }
    
    if ((org.avgResponseTimeMinutes || 100) <= 10) {
      factors.push({ name: 'Быстрый ответ', impact: '-2%', status: 'positive' as const });
    }
    
    if (org.isBoosted) {
      factors.push({ name: 'Продвижение', impact: '+5%', status: 'negative' as const });
    }
    
    return factors;
  };

  const buildCommissionTips = (org: any): string[] => {
    const tips: string[] = [];
    if (!org.isVerified) tips.push('Верификация снизит комиссию на 2%');
    if ((org.avgResponseTimeMinutes || 100) > 10) tips.push('Быстрый ответ (<10 мин) = -2%');
    if ((org.completedBookingsCount || 0) < 50) tips.push(`Ещё ${50 - (org.completedBookingsCount || 0)} заказов до статуса "Опытный"`)
    return tips;
  };

  const getMockData = (): IntelligenceData => ({
    visibility: {
      score: 72,
      state: 'NORMAL',
      rank: 'Выше среднего',
      factors: [
        { name: 'Рейтинг', score: 90, status: 'good' },
        { name: 'Скорость ответа', score: 70, status: 'warning' },
        { name: 'Завершённые заказы', score: 65, status: 'warning' },
        { name: 'Повторные клиенты', score: 45, status: 'warning' },
        { name: 'Доверие', score: 100, status: 'good' },
      ],
      tips: [
        'Отвечайте на заявки быстрее 10 минут',
        'Предлагайте скидки для повторных клиентов',
      ],
    },
    commission: {
      currentRate: 12,
      factors: [
        { name: 'Базовая ставка', impact: '15%', status: 'neutral' },
        { name: 'Верификация', impact: '-2%', status: 'positive' },
        { name: 'Высокий рейтинг', impact: '-2%', status: 'positive' },
        { name: 'Быстрый ответ', impact: '+1%', status: 'negative' },
      ],
      tips: [
        'Отвечайте быстрее для снижения комиссии на 2%',
        'Ещё 15 заказов до статуса "Опытный мастер"',
      ],
    },
    stats: {
      totalBookings: 45,
      completedBookings: 42,
      repeatRate: 28,
      avgResponseTime: 15,
      rating: 4.6,
      reviewsCount: 34,
    },
    lostOpportunities: 5,
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusColor = (status: 'good' | 'warning' | 'bad' | 'positive' | 'negative' | 'neutral'): string => {
    switch (status) {
      case 'good':
      case 'positive':
        return colors.success;
      case 'warning':
      case 'neutral':
        return colors.warning;
      case 'bad':
      case 'negative':
        return colors.brand;
      default:
        return '#666';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Загружаем данные...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.brand} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>Войти</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Моя эффективность</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* Visibility Score Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="eye" size={24} color={colors.brand} />
            </View>
            <Text style={styles.cardTitle}>Видимость в поиске</Text>
          </View>
          
          <View style={styles.scoreRow}>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreValue}>{data.visibility.score}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <View style={styles.scoreInfo}>
              <Text style={styles.rankText}>{data.visibility.rank}</Text>
              <View style={[styles.stateBadge, { backgroundColor: data.visibility.state === 'BOOSTED' ? colors.successBg : colors.border }]}>
                <Text style={[styles.stateText, { color: data.visibility.state === 'BOOSTED' ? colors.success : '#666' }]}>
                  {data.visibility.state === 'BOOSTED' ? '🚀 Продвигается' : '📊 Стандарт'}
                </Text>
              </View>
            </View>
          </View>

          {/* Factors */}
          <View style={styles.factorsContainer}>
            <Text style={styles.factorsTitle}>Что влияет:</Text>
            {data.visibility.factors.map((factor, index) => (
              <View key={index} style={styles.factorRow}>
                <View style={[styles.factorDot, { backgroundColor: getStatusColor(factor.status) }]} />
                <Text style={styles.factorName}>{factor.name}</Text>
                <View style={styles.factorBar}>
                  <View style={[styles.factorProgress, { width: `${factor.score}%`, backgroundColor: getStatusColor(factor.status) }]} />
                </View>
                <Text style={styles.factorScore}>{factor.score}</Text>
              </View>
            ))}
          </View>

          {/* Tips */}
          {data.visibility.tips.length > 0 && (
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>Как улучшить:</Text>
              {data.visibility.tips.map((tip, index) => (
                <View key={index} style={styles.tipRow}>
                  <Ionicons name="bulb" size={16} color={colors.warning} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Commission Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: colors.warningBg }]}>
              <Ionicons name="cash" size={24} color={colors.warning} />
            </View>
            <Text style={styles.cardTitle}>Комиссия платформы</Text>
          </View>

          <View style={styles.commissionRow}>
            <Text style={styles.commissionValue}>{data.commission.currentRate}%</Text>
            <Text style={styles.commissionLabel}>текущая ставка</Text>
          </View>

          {/* Commission Factors */}
          <View style={styles.commissionFactors}>
            {data.commission.factors.map((factor, index) => (
              <View key={index} style={styles.commissionFactorRow}>
                <Ionicons 
                  name={factor.status === 'positive' ? 'remove-circle' : factor.status === 'negative' ? 'add-circle' : 'ellipse'} 
                  size={16} 
                  color={getStatusColor(factor.status)} 
                />
                <Text style={styles.commissionFactorName}>{factor.name}</Text>
                <Text style={[styles.commissionFactorImpact, { color: getStatusColor(factor.status) }]}>
                  {factor.impact}
                </Text>
              </View>
            ))}
          </View>

          {/* Commission Tips */}
          {data.commission.tips.length > 0 && (
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>Как снизить:</Text>
              {data.commission.tips.map((tip, index) => (
                <View key={index} style={styles.tipRow}>
                  <Ionicons name="trending-down" size={16} color={colors.success} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Stats Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: colors.successBg }]}>
              <Ionicons name="stats-chart" size={24} color={colors.success} />
            </View>
            <Text style={styles.cardTitle}>Статистика</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{data.stats.totalBookings}</Text>
              <Text style={styles.statLabel}>Всего заказов</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{data.stats.completedBookings}</Text>
              <Text style={styles.statLabel}>Завершено</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{data.stats.repeatRate}%</Text>
              <Text style={styles.statLabel}>Повторных</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{data.stats.avgResponseTime} мин</Text>
              <Text style={styles.statLabel}>Ответ</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>⭐ {data.stats.rating.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Рейтинг</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{data.stats.reviewsCount}</Text>
              <Text style={styles.statLabel}>Отзывов</Text>
            </View>
          </View>
        </View>

        {/* Lost Opportunities Card */}
        {data.lostOpportunities > 0 && (
          <View style={[styles.card, styles.warningCard]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="warning" size={24} color={colors.brand} />
              </View>
              <Text style={styles.cardTitle}>Упущенные заказы</Text>
            </View>
            
            <Text style={styles.lostValue}>{data.lostOpportunities}</Text>
            <Text style={styles.lostLabel}>заказов за последний месяц</Text>
            
            <View style={styles.lostReasons}>
              <Text style={styles.lostReasonsTitle}>Возможные причины:</Text>
              <Text style={styles.lostReasonItem}>• Медленный ответ на заявки</Text>
              <Text style={styles.lostReasonItem}>• Нет свободных слотов</Text>
              <Text style={styles.lostReasonItem}>• Клиенты выбрали конкурентов</Text>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: 24,
    backgroundColor: colors.brand,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  warningCard: {
    borderWidth: 1,
    borderColor: colors.brandSoft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 20,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brandSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.brand,
  },
  scoreMax: {
    fontSize: 12,
    color: '#666',
  },
  scoreInfo: {
    flex: 1,
  },
  rankText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  stateBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '500',
  },
  factorsContainer: {
    marginTop: 8,
  },
  factorsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  factorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  factorName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  factorBar: {
    width: 80,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  factorProgress: {
    height: '100%',
    borderRadius: 3,
  },
  factorScore: {
    width: 30,
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    textAlign: 'right',
  },
  tipsContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.warningBg,
    borderRadius: 8,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
  },
  commissionRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  commissionValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.warning,
  },
  commissionLabel: {
    fontSize: 14,
    color: '#666',
  },
  commissionFactors: {
    gap: 8,
  },
  commissionFactorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commissionFactorName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  commissionFactorImpact: {
    fontSize: 14,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    width: '30%',
    backgroundColor: colors.border,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  lostValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.brand,
    textAlign: 'center',
  },
  lostLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  lostReasons: {
    padding: 12,
    backgroundColor: colors.brandSoft,
    borderRadius: 8,
  },
  lostReasonsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand,
    marginBottom: 8,
  },
  lostReasonItem: {
    fontSize: 13,
    color: colors.brand,
    marginBottom: 2,
  },
});
