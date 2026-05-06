import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '../src/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../src/context/AuthContext';
import { useLocation } from '../src/context/LocationContext';
import { api } from '../src/services/api';
import IntelligenceHub from '../src/components/IntelligenceHub';
import ProviderActionHub from '../src/components/ProviderActionHub';
import LiveRequests, { LiveRequest } from '../src/components/LiveRequests';
import { useProviderRealtime } from '../src/hooks/useWebSocket';
import { quickRequestAPI, providerStatusAPI } from '../src/services/api';
import * as Haptics from 'expo-haptics';
import { Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLUSTERS, CLUSTER_ORDER, type ClusterId } from '../src/data/clusters';
import { useCity } from '../src/context/CityContext';
import { theme } from '../src/context/ThemeContext';
const colors = theme.colors;

const { width, height } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════
// 🔥 V5 UX — ГЛАВНАЯ = РЕШЕНИЕ ЗАДАЧИ, НЕ МЕНЮ
// 
// Структура:
// 1. HERO: "{t('home.problem_title')}" + 2 кнопки
// 2. SMART MATCHING: 1-2 лучших мастера
// 3. QUICK ACTIONS: компактные иконки
// 4. NEARBY: при скролле
// ═══════════════════════════════════════════════════════════

// 🔥 PROVIDER HOME (без изменений)
function ProviderHome() {
  const router = useRouter();
  const { colors, isDark } = useThemeContext();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ pending: 0, today: 0, completed: 0, revenue: 0 });
  const [pendingQuotes, setPendingQuotes] = useState<any[]>([]);

  // 🔥 Realtime live requests (provider:new_request via useProviderRealtime polling)
  const [liveRequests, setLiveRequests] = useState<LiveRequest[]>([]);
  const providerSlug = (user as any)?.providerSlug || 'avtomaster-pro';

  // 🟢 Online/Offline toggle — persisted in Mongo + AsyncStorage cache for instant UI
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [statusBusy, setStatusBusy] = useState(false);

  // Hydrate from server on mount (с локальным кешем для no-flicker)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(`provider:isOnline:${providerSlug}`);
        if (cached !== null && !cancelled) setIsOnline(cached === 'true');
        const r = await providerStatusAPI.get(providerSlug);
        if (!cancelled && r?.data) {
          const v = !!r.data.isOnline;
          setIsOnline(v);
          await AsyncStorage.setItem(`provider:isOnline:${providerSlug}`, String(v));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [providerSlug]);

  const toggleOnline = useCallback(async (value: boolean) => {
    if (statusBusy) return;
    setStatusBusy(true);
    const prev = isOnline;
    setIsOnline(value); // optimistic
    try {
      await providerStatusAPI.set(providerSlug, value);
      await AsyncStorage.setItem(`provider:isOnline:${providerSlug}`, String(value));
      try { Haptics.selectionAsync().catch(() => {}); } catch {}
      // если ушли в offline — чистим текущие live cards (логически они уже не для нас)
      if (!value) setLiveRequests([]);
    } catch (e) {
      setIsOnline(prev); // rollback
    } finally {
      setStatusBusy(false);
    }
  }, [isOnline, providerSlug, statusBusy]);

  // Subscribe to realtime provider events
  useProviderRealtime({
    onNewRequest: (data: any) => {
      // Игнорируем заявки если мы офлайн (на бэке уже фильтруется, но защита для in-flight)
      if (!isOnline) return;
      const incoming: LiveRequest = {
        requestId:     data.requestId,
        problemLabel:  data.problemLabel,
        echoText:      data.echoText,
        priceEstimate: data.priceEstimate,
        finalPrice:    data.finalPrice,
        etaText:       data.etaText,
        distanceText:  data.distanceText,
        expiresAt:     data.expiresAt,
        expiresInSec:  data.expiresInSec,
        surge:         data.surge,
        surgeLabel:    data.surgeLabel,
      };
      setLiveRequests(prev => {
        if (prev.find(r => r.requestId === incoming.requestId)) return prev;
        return [incoming, ...prev].slice(0, 10);
      });
      // Haptic feedback on mobile (no-op on web)
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch {}
    },
    onRequestTaken: (data: any) => {
      // другой мастер забрал — убираем
      setLiveRequests(prev => prev.filter(r => r.requestId !== data.requestId));
    },
  });

  const handleAcceptLive = useCallback(async (req: LiveRequest) => {
    try {
      await quickRequestAPI.accept(req.requestId, providerSlug);
      setLiveRequests(prev => prev.filter(r => r.requestId !== req.requestId));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch {}
      router.push({ pathname: '/provider/current-job', params: { id: req.requestId } });
    } catch (e: any) {
      console.log('accept error:', e?.response?.data || e?.message);
      // если другой мастер забрал — тоже убираем
      if (e?.response?.status === 409 || e?.response?.status === 410) {
        setLiveRequests(prev => prev.filter(r => r.requestId !== req.requestId));
      }
    }
  }, [providerSlug, router]);

  const handleRejectLive = useCallback(async (req: LiveRequest) => {
    setLiveRequests(prev => prev.filter(r => r.requestId !== req.requestId));
    try {
      await quickRequestAPI.reject(req.requestId, providerSlug);
    } catch {
      // silent — уже скрыто из UI
    }
  }, [providerSlug]);

  const handleExpireLive = useCallback((req: LiveRequest) => {
    setLiveRequests(prev => prev.filter(r => r.requestId !== req.requestId));
  }, []);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async () => {
    try {
      // Fetch incoming quotes for provider
      const quotesRes = await api.get('/quotes/incoming');
      const quotes = quotesRes.data || [];
      setPendingQuotes(quotes.filter((q: any) => q.status === 'pending').slice(0, 3));
      
      setStats({
        pending: quotes.filter((q: any) => q.status === 'pending').length,
        today: quotes.filter((q: any) => {
          const date = new Date(q.createdAt);
          return date.toDateString() === new Date().toDateString();
        }).length,
        completed: 0,
        revenue: 0,
      });
    } catch (error) {
      console.log('Provider fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>{t('provider.greeting')}, {user?.firstName || t('provider.default_name')}</Text>
              <Text style={[styles.userName, { color: colors.text }]}>{t('provider.workshop_account')}</Text>
            </View>
            {/* Online/Offline toggle */}
            <View style={styles.statusToggle}>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOnline ? (colors.success || colors.success) : (colors.textMuted || colors.textMuted) },
                  ]}
                />
                <Text style={[styles.statusText, { color: isOnline ? colors.text : colors.textSecondary }]}>
                  {isOnline ? t('provider.online') : t('provider.offline')}
                </Text>
              </View>
              <Switch
                testID="provider-online-toggle"
                value={isOnline}
                onValueChange={toggleOnline}
                disabled={statusBusy}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={Platform.OS === 'android' ? (isOnline ? colors.brandDark : colors.card) : undefined}
                ios_backgroundColor={colors.border}
              />
            </View>
            <TouchableOpacity
              testID="provider-settings-btn"
              style={[styles.headerIconBtn, { backgroundColor: colors.card, marginLeft: 8 }]}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* 🔥 #1 — LIVE REQUESTS (realtime, deньги прямо сейчас) */}
          {isOnline ? (
            <LiveRequests
              requests={liveRequests}
              onAccept={handleAcceptLive}
              onReject={handleRejectLive}
              onExpire={handleExpireLive}
            />
          ) : (
            <View
              testID="offline-banner"
              style={[styles.offlineBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.offlineIcon, { backgroundColor: colors.errorBg || 'rgba(156,163,175,0.15)' }]}>
                <Ionicons name="moon-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.offlineTitle, { color: colors.text }]}>{t('provider.offline_title')}</Text>
                <Text style={[styles.offlineSubtitle, { color: colors.textSecondary }]}>
                  {t('provider.offline_desc')}
                </Text>
              </View>
              <TouchableOpacity
                testID="offline-banner-go-online"
                onPress={() => toggleOnline(true)}
                style={[styles.offlineCta, { backgroundColor: colors.brand }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.offlineCtaText, { color: colors.onPrimary || colors.brandText }]}>{t('provider.activate')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 💰 #2 — Action Hub — Tier / Earnings / Lost Revenue / Opportunities */}
          <View style={styles.providerHubWrap}>
            <ProviderActionHub />
          </View>

          {/* Pending Quotes */}
          {pendingQuotes.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('provider.new_requests')}</Text>
              {pendingQuotes.map((quote) => (
                <TouchableOpacity
                  key={quote._id}
                  style={[styles.quoteCard, { backgroundColor: colors.card }]}
                  onPress={() => router.push({ pathname: '/quote-details', params: { id: quote._id } })}
                >
                  <View style={styles.quoteHeader}>
                    <Text style={[styles.quoteTitle, { color: colors.text }]} numberOfLines={1}>
                      {quote.description || t('provider.request_default')}
                    </Text>
                    <View style={[styles.newBadge, { backgroundColor: colors.brand }]}>
                      <Text style={[styles.newBadgeText, { color: colors.onPrimary || colors.brandText }]}>{t('provider.new_badge')}</Text>
                    </View>
                  </View>
                  <View style={styles.quoteFooter}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.quoteTime, { color: colors.textSecondary }]}>
                      {new Date(quote.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 100 }} />
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 🔥 V5 CUSTOMER HOME — UBER-STYLE UX
// ═══════════════════════════════════════════════════════════
function CustomerHome() {
  const router = useRouter();
  const { colors, isDark } = useThemeContext();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { selectedCity } = useCity();
  
  // 🌍 Используем глобальный LocationContext
  const { location, isLocationEnabled, refreshLocation, setShowPermissionModal } = useLocation();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [matchedProviders, setMatchedProviders] = useState<any[]>([]);
  // Day 3: selected cluster drives the popular-services list below.
  // Sprint 35: read `?cluster=<id>` query param to deep-link straight into a sub-cluster
  // (set from the home tab "Additional services" rail). Falls back to 'repair'.
  const params = useLocalSearchParams<{ cluster?: string }>();
  const initialCluster: ClusterId =
    params?.cluster && CLUSTER_ORDER.includes(params.cluster as ClusterId)
      ? (params.cluster as ClusterId)
      : 'repair';
  const [selectedCluster, setSelectedCluster] = useState<ClusterId>(initialCluster);

  // If the param changes (rare — e.g. user navigates back/forth between rails), re-sync.
  useEffect(() => {
    if (params?.cluster && CLUSTER_ORDER.includes(params.cluster as ClusterId)) {
      setSelectedCluster(params.cluster as ClusterId);
    }
  }, [params?.cluster]);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 🔥 Sprint QR-1: Drop protection — если у юзера есть active_request, возвращаем его на searching screen.
  // Это самый частый dropoff: юзер закрыл app → мастер найден → юзер вернулся → не знает где он.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const active = await AsyncStorage.getItem('active_request');
        if (!cancelled && active) {
          // Phase 3.0b STEP-1: redirect to canonical auto-request detail.
          router.replace(`/auto-request/${active}` as any);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [router]);

  // 🔥 Загружаем matching при изменении локации
  useEffect(() => {
    if (location) {
      fetchMatching(location.lat, location.lng);
    }
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [location]);

  const fetchMatching = async (lat: number, lng: number) => {
    try {
      setLoading(true);
      const res = await api.get('/matching/nearby', { params: { lat, lng, limit: 3 } });
      setMatchedProviders(res.data || []);
    } catch (error) {
      console.log('Matching error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshLocation();
    if (location) {
      await fetchMatching(location.lat, location.lng);
    }
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greeting_morning');
    if (hour < 18) return t('home.greeting_day');
    return t('home.greeting_evening');
  };

  // 🌍 Обработчик клика по кнопке геолокации
  const handleLocationPress = () => {
    if (!isLocationEnabled) {
      setShowPermissionModal(true);
    } else {
      refreshLocation();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* ═══════ HEADER — 3 ICONS (Alerts, Messages, Map) ═══════ */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>{getGreeting()}</Text>
              <Text style={[styles.userName, { color: colors.text }]}>{user?.firstName || t('home.guest')}</Text>
            </View>
            <View style={styles.headerRight}>
              {/* City switcher chip (Stage 2 tail) */}
              <TouchableOpacity
                testID="home-city-switcher"
                style={[styles.cityChipHeader, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/city-select' as any)}
                activeOpacity={0.85}
              >
                <Ionicons name="location" size={14} color={colors.brand} />
                <Text style={[styles.cityChipHeaderText, { color: colors.text }]} numberOfLines={1}>
                  {selectedCity?.name || 'Выбрать город'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              {/* Notifications/Alerts */}
              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: colors.card }]}
                onPress={() => router.push('/notifications')}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.text} />
                {/* Badge for unread */}
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>2</Text>
                </View>
              </TouchableOpacity>

              {/* Messages */}
              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: colors.card }]}
                onPress={() => router.push('/messages')}
              >
                <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ═══════ 🔥 HERO — ОДНО ДЕЙСТВИЕ ═══════ */}
          <View style={styles.heroSection}>
            <Text style={[styles.heroQuestion, { color: colors.text }]}>
              {t('home.problem_title')}
            </Text>

            {/* Primary CTA — Quick Request */}
            <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/auto-request/choose')}>
              <LinearGradient
                colors={[colors.brand, colors.brandDark]}
                style={styles.primaryCTA}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="flash" size={24} color={colors.onPrimary || colors.brandText} />
                <View style={styles.ctaTextBlock}>
                  <Text style={[styles.primaryCTATitle, { color: colors.onPrimary || colors.brandText }]}>{t('home.solve_fast_title')}</Text>
                  <Text style={[styles.primaryCTASub, { color: (colors.onPrimary || colors.brandText) }]}>{t('home.solve_fast_sub')}</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={28} color={colors.onPrimary || colors.brandText} />
              </LinearGradient>
            </TouchableOpacity>

            {/* Secondary CTA — Services */}
            <TouchableOpacity
              style={[styles.secondaryCTA, { backgroundColor: colors.card }]}
              onPress={() => router.push('/services')}
              activeOpacity={0.7}
            >
              <View style={[styles.secondaryCTAIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="list" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.secondaryCTAText, { color: colors.text }]}>{t('home.choose_service')}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ═══════ 🔥 SMART STATUS — НЕ СПИСОК, А ИНФОРМАЦИЯ ═══════ */}
          <View style={styles.matchingSection}>
            {/* Sprint 33: Cluster blocks — 4 vertical markets, not just repair */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home.what_do_you_need')}</Text>
            <View style={styles.clusterGrid} testID="cluster-grid">
              {CLUSTER_ORDER.map((cid) => {
                const c = CLUSTERS[cid];
                const tone = c.tone === 'success' ? colors.success : c.tone === 'warning' ? colors.warning : colors.brand;
                const active = selectedCluster === cid;
                return (
                  <TouchableOpacity
                    key={cid}
                    testID={`cluster-${cid}`}
                    activeOpacity={0.85}
                    onPress={() => setSelectedCluster(cid)}
                    style={[
                      styles.clusterCard,
                      { backgroundColor: colors.card, borderColor: active ? tone : colors.border, borderWidth: active ? 2 : 1 },
                    ]}
                  >
                    <View style={[styles.clusterIconWrap, { backgroundColor: tone + '1A', borderColor: tone + '33' }]}>
                      <Ionicons name={c.icon} size={26} color={tone} />
                    </View>
                    <Text style={[styles.clusterTitle, { color: colors.text }]} numberOfLines={2}>{t(c.titleKey)}</Text>
                    <Text style={[styles.clusterSub, { color: colors.textMuted || colors.textSecondary }]} numberOfLines={1}>{t(c.subKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quick Service Grid — services for selected cluster */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('home.popular_services')}
            </Text>
            <View style={styles.serviceGrid}>
              {CLUSTERS[selectedCluster].services.map((s) => {
                const tone = s.tone === 'success' ? colors.success : s.tone === 'warning' ? colors.warning : colors.brand;
                // Stage 3 mapping: cluster service.key → backend SERVICE_MAP key.
                // If we have a Stage 3 key → go to Uber-like flow.
                // Else → fall back to canonical auto-request choose screen.
                const STAGE3_MAP: Record<string, string> = {
                  oil_change: 'oil_change',
                  brakes: 'brakes',
                  diagnostics: 'diagnostics',
                  computer_diagnostics: 'diagnostics',
                  engine_wont_start: 'engine',
                  battery: 'battery',
                  tires: 'tires',
                  tire_change: 'tires',
                  pre_purchase_inspection: 'pre_purchase',
                  evacuation: 'towing',
                  towing: 'towing',
                };
                const stage3Key = STAGE3_MAP[s.key];
                const onPress = () => {
                  if (stage3Key && selectedCity?.code) {
                    router.push({ pathname: '/request/create', params: { serviceKey: stage3Key } });
                  } else {
                    router.push('/auto-request/choose');
                  }
                };
                return (
                  <TouchableOpacity
                    key={s.key}
                    testID={`service-${s.key}`}
                    style={[styles.serviceItem, { backgroundColor: colors.card }]}
                    onPress={onPress}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.serviceIconWrap, { backgroundColor: tone + '15' }]}>
                      <Ionicons name={s.icon} size={24} color={tone} />
                    </View>
                    <Text style={[styles.serviceLabel, { color: colors.text }]} numberOfLines={1}>{t(`home.svc.${s.key}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Info Banner - мастера рядом */}
            {matchedProviders.length > 0 && (
              <View style={[styles.infoBanner, { backgroundColor: colors.card }]}>
                <View style={[styles.infoBannerIcon, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="people" size={20} color={colors.success} />
                </View>
                <View style={styles.infoBannerContent}>
                  <Text style={[styles.infoBannerTitle, { color: colors.text }]}>
                    {t('home.providers_ready', { n: matchedProviders.length })}
                  </Text>
                  <Text style={[styles.infoBannerSub, { color: colors.textSecondary }]}>
                    {t('home.nearest_in', {
                      km: matchedProviders[0]?.distanceKm?.toFixed(1) || '0.5',
                      min: Math.round((matchedProviders[0]?.distanceKm || 1) * 4 + 3),
                    })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
            )}

            {/* Surge indicator */}
            <View style={[styles.surgeCard, { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}>
              <Ionicons name="flame" size={18} color={colors.brand} />
              <View style={styles.surgeContent}>
                <Text style={[styles.surgeTitle, { color: colors.brand }]}>{t('home.surge_title')}</Text>
                <Text style={[styles.surgeSub, { color: colors.textSecondary }]}>{t('home.surge_sub')}</Text>
              </View>
            </View>
          </View>

          {/* ═══════ QUICK ACTIONS — COMPACT ═══════ */}
          <View style={styles.quickActionsSection}>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/services')}
              >
                <Ionicons name="location" size={22} color={colors.brand} />
                <Text style={[styles.quickActionText, { color: colors.text }]}>{t('home.find_shop')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/garage')}
              >
                <Ionicons name="car-sport" size={22} color={colors.brand} />
                <Text style={[styles.quickActionText, { color: colors.text }]}>{t('home.my_garage')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/(tabs)/quotes')}
              >
                <Ionicons name="calendar" size={22} color={colors.success} />
                <Text style={[styles.quickActionText, { color: colors.text }]}>{t('home.bookings_quick')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/(tabs)/quotes')}
              >
                <Ionicons name="document-text" size={22} color={colors.warning} />
                <Text style={[styles.quickActionText, { color: colors.text }]}>{t('home.requests_quick')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ═══════ 🔥 SPRINT 11 INTELLIGENCE HUB ═══════ */}
          <IntelligenceHub colors={colors} />

          <View style={{ height: 120 }} />
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════
export default function HomeScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (user?.role?.startsWith('provider')) {
    return <ProviderHome />;
  }

  return <CustomerHome />;
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 14,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cityChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 140,
  },
  cityChipHeaderText: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.brand,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Hero Section
  heroSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  heroQuestion: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 32,
  },
  primaryCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    gap: 14,
  },
  ctaTextBlock: {
    flex: 1,
  },
  primaryCTATitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  primaryCTASub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  secondaryCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginTop: 10,
  },
  secondaryCTAIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  secondaryCTAText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },

  // Matching Section
  matchingSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 14,
  },
  providerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  providerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  providerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  providerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  providerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  providerRating: {
    fontSize: 13,
    fontWeight: '600',
  },
  providerDistance: {
    fontSize: 13,
  },
  providerResponse: {
    fontSize: 12,
  },
  matchBadge: {
    backgroundColor: '#10B98120',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  matchBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reasonsBlock: {
    marginBottom: 12,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  reasonText: {
    fontSize: 12,
  },
  selectBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  selectBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 20,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionItem: {
    width: (width - 60) / 4,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },

  // Provider Home Styles
  providerHubWrap: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  statusText: {
    fontSize: 12, fontWeight: '600',
  },
  offlineBanner: {
    marginHorizontal: 20, marginBottom: 16,
    padding: 14, borderRadius: 14, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  offlineIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  offlineTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  offlineSubtitle: { fontSize: 12 },
  offlineCta: {
    paddingHorizontal: 14, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  offlineCtaText: { fontSize: 13, fontWeight: '700' },
  providerStats: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  quoteCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quoteTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  newBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  quoteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quoteTime: {
    fontSize: 12,
  },
  providerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  providerActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 14,
  },
  providerActionText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  },

  // Service Grid (Uber-style)
  // Sprint 33: cluster blocks on home (2x2 palette grid)
  clusterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  clusterCard: {
    width: '48%',
    minHeight: 156,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 4,
  },
  clusterIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 10,
  },
  clusterTitle: { fontSize: 15, fontWeight: '800', lineHeight: 19, letterSpacing: -0.2 },
  clusterSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },

  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  serviceItem: {
    width: (width - 60) / 3,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  serviceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  serviceLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  infoBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // Surge Card
  surgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  surgeContent: {
    flex: 1,
  },
  surgeTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  surgeSub: {
    fontSize: 11,
    marginTop: 2,
  },
});
