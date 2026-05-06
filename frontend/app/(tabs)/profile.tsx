/**
 * Profile = HUB (not settings).
 * Top → bottom hierarchy:
 *   Header (avatar + name + email + role badge)
 *   InspectorStats     — only when role=provider
 *   RequestsSummary    — Active / Reports / Completed chips with live counts
 *   LastRequestCard    — last request preview, deep-link to /auto-request/[id]
 *   PrimaryActions     — "Inspect a car" / "Find a car"
 *   InspectorActions   — Available jobs / My jobs (provider only)
 *   ClientExtras       — Inspection history + saved cars (client only)
 *   BecomeInspector    — upgrade CTA when role!=provider
 *   Referral           — invite-friend block
 *   Settings           — language / theme / notifications / help / support / logout
 *
 * Removed deliberately: «Мой гараж», «Избранные СТО», «Споры», «Quick actions».
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import AccountSwitcherModal from '../../src/components/AccountSwitcherModal';
import { api } from '../../src/services/api';

const LANGUAGES: { code: 'de' | 'en' | 'ru'; name: string; flag: string }[] = [
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
];

type CarRequest = {
  id: string;
  type?: string;
  brand?: string;
  model?: string;
  city?: string;
  country?: string;
  status: string;
  urgency?: string;
  createdAt?: string;
};

type CreditBalance = {
  balance?: number;
  reserved?: number;
  used?: number;
  available?: number;
};

const ACTIVE_STATUSES = new Set(['open', 'matching', 'in_progress']);

// Map a request status → 0-indexed step in the 4-step timeline.
// Steps: 0 Paid · 1 Inspector matched · 2 Visit · 3 Report
const STATUS_TO_STEP: Record<string, number> = {
  open: 1,
  matching: 1,
  in_progress: 2,
  report_ready: 3,
  completed: 3,
};

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, isDark, setTheme } = useThemeContext();
  const { t, i18n } = useTranslation();
  const { user, logout, accounts, activeAccount } = useAuth();

  const language = i18n.language as 'de' | 'en' | 'ru';
  const setLanguage = (lng: 'de' | 'en' | 'ru') => i18n.changeLanguage(lng);
  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // ─── Hub data ────────────────────────────────────────────────────────────
  const isInspector = !!user && (user.role === 'provider' || user.role.startsWith('provider'));

  const [requests, setRequests] = useState<CarRequest[]>([]);
  const [reportsCount, setReportsCount] = useState(0);
  const [inspectorJobs, setInspectorJobs] = useState(0);
  const [credits, setCredits] = useState<CreditBalance | null>(null);

  const loadHubData = React.useCallback(async () => {
    if (!user) {
      setRequests([]);
      setReportsCount(0);
      setInspectorJobs(0);
      setCredits(null);
      return;
    }
    try {
      if (!isInspector) {
        const [reqRes, repRes, credRes] = await Promise.all([
          api.get('/customer/requests/my'),
          api.get('/customer/reports'),
          api.get('/customer/credits'),
        ]);
        const list: CarRequest[] = Array.isArray(reqRes.data)
          ? reqRes.data
          : reqRes.data?.requests ?? [];
        setRequests(list);
        const reports = Array.isArray(repRes.data) ? repRes.data : repRes.data?.reports ?? [];
        setReportsCount(reports.length);
        setCredits(credRes.data ?? null);
      } else {
        const inboxRes = await api.get('/provider/requests/inbox');
        const inbox = Array.isArray(inboxRes.data) ? inboxRes.data : inboxRes.data?.requests ?? [];
        setInspectorJobs(inbox.length);
      }
    } catch {
      /* silently keep zeros — auth/network errors are non-blocking on profile */
    }
  }, [user, isInspector]);

  useEffect(() => {
    loadHubData();
  }, [loadHubData]);

  useFocusEffect(
    React.useCallback(() => {
      loadHubData();
    }, [loadHubData])
  );

  const activeCount = requests.filter((r) => ACTIVE_STATUSES.has(r.status)).length;
  const completedCount = requests.filter((r) => r.status === 'completed').length;
  const lastRequest =
    [...requests]
      .sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      )
      .find((r) => ACTIVE_STATUSES.has(r.status)) ||
    [...requests].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )[0] ||
    null;

  // Personalised state for the greeting strip + conditional referral.
  const profileState: 'new' | 'active' | 'history' =
    activeCount > 0 ? 'active' : reportsCount > 0 ? 'history' : 'new';
  const greetingTitle =
    profileState === 'new'
      ? t('profile_hub.greeting_new')
      : profileState === 'active'
        ? t('profile_hub.greeting_active')
        : t('profile_hub.greeting_history', { count: reportsCount });
  const greetingSub =
    profileState === 'new'
      ? t('profile_hub.greeting_new_sub')
      : profileState === 'active'
        ? t('profile_hub.greeting_active_sub')
        : t('profile_hub.greeting_history_sub');

  // ─── Logout flow ─────────────────────────────────────────────────────────
  const performLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    router.replace('/');
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      setShowLogoutModal(true);
    } else {
      Alert.alert(t('profile.logout'), t('profile.logout_confirm_body'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logout'), style: 'destructive', onPress: performLogout },
      ]);
    }
  };

  // ─── Renderers ───────────────────────────────────────────────────────────
  const roleLabel = !user
    ? null
    : isInspector
      ? t('profile_hub.role_inspector')
      : t('profile_hub.role_client');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ════════ HEADER ════════ */}
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('profile.title')}</Text>
          </View>

          {/* ════════ USER CARD ════════ */}
          <View
            testID="profile-user-card"
            style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.avatarCircle, { backgroundColor: 'rgba(245,184,0,0.15)' }]}>
              <Ionicons name="person" size={28} color={colors.primary} />
            </View>
            <View style={styles.userInfo}>
              {user ? (
                <>
                  <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                    {`${user.firstName} ${user.lastName}`.trim() || user.email}
                  </Text>
                  <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                    {user.email}
                  </Text>
                  {roleLabel && (
                    <View
                      testID="profile-role-badge"
                      style={[
                        styles.roleBadge,
                        {
                          backgroundColor: isInspector
                            ? 'rgba(16,185,129,0.15)'
                            : 'rgba(245,184,0,0.15)',
                        },
                      ]}
                    >
                      <Ionicons
                        name={isInspector ? 'shield-checkmark' : 'person-circle'}
                        size={12}
                        color={isInspector ? '#10B981' : colors.primary}
                      />
                      <Text
                        style={[
                          styles.roleBadgeText,
                          { color: isInspector ? '#10B981' : colors.primary },
                        ]}
                      >
                        {roleLabel}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.userName, { color: colors.text }]}>
                    {t('profile_hub.guest_name')}
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/login')}>
                    <Text style={[styles.loginLink, { color: colors.primary }]}>
                      {t('profile.login')}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* ════════ PERSONALISED GREETING (state-driven) ════════ */}
          {user && !isInspector && (
            <View
              testID="profile-greeting"
              style={[
                styles.greetingStrip,
                {
                  backgroundColor: colors.card,
                  borderColor:
                    profileState === 'active' ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.greetingTitle, { color: colors.text }]} numberOfLines={2}>
                {greetingTitle}
              </Text>
              <Text
                style={[styles.greetingSub, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {greetingSub}
              </Text>
            </View>
          )}

          {/* ════════ INSPECTOR DASHBOARD (provider only) — strict role separation ════════ */}
          {user && isInspector && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {t('profile_hub.inspector_dashboard')}
              </Text>
              <View
                testID="inspector-stats"
                style={[
                  styles.inspectorGrid,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.inspectorCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('profile_hub.inspector_earnings_month')}
                  </Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>€0</Text>
                </View>
                <View style={[styles.inspectorCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('profile_hub.inspector_active_jobs')}
                  </Text>
                  <Text style={[styles.statValue, { color: colors.primary }]}>{inspectorJobs}</Text>
                </View>
                <View style={[styles.inspectorCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('profile_hub.inspector_completed')}
                  </Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
                </View>
                <View style={[styles.inspectorCell, { borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('profile_hub.inspector_rating')}
                  </Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>★ —</Text>
                </View>
              </View>

              <Text
                testID="inspector-motivator"
                style={[styles.statsMotivator, { color: colors.primary }]}
              >
                👉 {t('profile_hub.inspector_jobs_nearby', { count: inspectorJobs })} ·{' '}
                {t('profile_hub.inspector_motivator')}
              </Text>

              {/* 3 job buckets */}
              <View style={styles.inspectorActions} testID="inspector-actions">
                <TouchableOpacity
                  testID="inspector-jobs-available"
                  activeOpacity={0.85}
                  onPress={() => router.push('/inspector/exposures')}
                  style={[styles.ctaPrimary, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.ctaPrimaryText}>
                    {t('profile_hub.inspector_jobs_available')}
                  </Text>
                </TouchableOpacity>
                <View style={styles.inspectorActionsRow}>
                  <TouchableOpacity
                    testID="inspector-jobs-mine"
                    activeOpacity={0.85}
                    onPress={() => router.push('/inspector/jobs')}
                    style={[
                      styles.inspectorSecondary,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.ctaSecondaryText, { color: colors.text }]}>
                      {t('profile_hub.inspector_jobs_mine')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="inspector-jobs-history"
                    activeOpacity={0.85}
                    onPress={() => router.push('/inspector/jobs')}
                    style={[
                      styles.inspectorSecondary,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.ctaSecondaryText, { color: colors.text }]}>
                      {t('profile_hub.inspector_jobs_history')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Public-profile link */}
              <TouchableOpacity
                testID="inspector-public-profile"
                activeOpacity={0.7}
                onPress={() => router.push('/provider-intelligence')}
                style={[
                  styles.publicProfileRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name="open-outline" size={16} color={colors.primary} />
                <Text style={[styles.publicProfileText, { color: colors.text }]}>
                  {t('profile_hub.inspector_public_profile')}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </>
          )}

          {/* ════════ MY PACKAGE — credits balance + history (client only) ════════ */}
          {user && !isInspector && (() => {
            const balance = credits?.balance ?? 0;
            const used = credits?.used ?? 0;
            const available = credits?.available ?? balance;
            const total = balance + used;
            const hasPackage = total > 0;
            const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
            return (
              <View testID="package-card" style={[styles.packageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.packageHead}>
                  <View style={[styles.packageIconBox, { backgroundColor: 'rgba(245,184,0,0.15)' }]}>
                    <Ionicons name="cube" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.packageTitle, { color: colors.text }]}>{t('home.package_section')}</Text>
                  <TouchableOpacity testID="package-buy" onPress={() => router.push('/packages')} hitSlop={8}>
                    <Text style={[styles.packageBuy, { color: colors.primary }]}>{t('home.package_buy')} →</Text>
                  </TouchableOpacity>
                </View>

                {hasPackage ? (
                  <>
                    <View style={styles.packageStatsRow}>
                      <View style={styles.packageStatBlock}>
                        <Text style={[styles.packageStatValue, { color: colors.text }]}>{available}</Text>
                        <Text style={[styles.packageStatLabel, { color: colors.textSecondary }]}>{t('home.package_available')}</Text>
                      </View>
                      <View style={[styles.packageStatDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.packageStatBlock}>
                        <Text style={[styles.packageStatValue, { color: colors.text }]}>{used}</Text>
                        <Text style={[styles.packageStatLabel, { color: colors.textSecondary }]}>{t('home.package_used')}</Text>
                      </View>
                      <View style={[styles.packageStatDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.packageStatBlock}>
                        <Text style={[styles.packageStatValue, { color: colors.text }]}>{total}</Text>
                        <Text style={[styles.packageStatLabel, { color: colors.textSecondary }]}>{t('home.package_total')}</Text>
                      </View>
                    </View>
                    <View style={[styles.packageBar, { backgroundColor: colors.border }]}>
                      <View style={[styles.packageBarFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                    </View>
                  </>
                ) : (
                  <View style={styles.packageEmpty}>
                    <Text style={[styles.packageEmptyTitle, { color: colors.text }]}>{t('home.no_package_title')}</Text>
                    <Text style={[styles.packageEmptySub, { color: colors.textSecondary }]}>{t('home.no_package_sub')}</Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* ════════ MY REQUESTS — chips with counts (client only) ════════ */}
          {user && !isInspector && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {t('profile_hub.my_requests')}
              </Text>
              <View style={styles.chipsRow} testID="requests-summary">
                <RequestChip
                  testID="chip-active"
                  label={t('profile_hub.tab_active')}
                  count={activeCount}
                  icon="time-outline"
                  color={colors.primary}
                  onPress={() => router.push('/(tabs)/requests')}
                  cardBg={colors.card}
                  border={colors.border}
                  textColor={colors.text}
                  subColor={colors.textSecondary}
                />
                <RequestChip
                  testID="chip-reports"
                  label={t('profile_hub.tab_reports')}
                  count={reportsCount}
                  icon="document-text-outline"
                  color="#10B981"
                  onPress={() => router.push('/(tabs)/reports')}
                  cardBg={colors.card}
                  border={colors.border}
                  textColor={colors.text}
                  subColor={colors.textSecondary}
                />
                <RequestChip
                  testID="chip-completed"
                  label={t('profile_hub.tab_completed')}
                  count={completedCount}
                  icon="checkmark-circle-outline"
                  color={colors.textSecondary}
                  onPress={() => router.push('/(tabs)/requests')}
                  cardBg={colors.card}
                  border={colors.border}
                  textColor={colors.text}
                  subColor={colors.textSecondary}
                />
              </View>
            </>
          )}

          {/* ════════ LAST REQUEST + TIMELINE  /  EMPTY-NEXT-ACTION (client) ════════ */}
          {user && !isInspector && (
            <View style={{ marginBottom: 16 }}>
              {lastRequest ? (
                <TouchableOpacity
                  testID="last-request-card"
                  activeOpacity={0.85}
                  onPress={() => router.push(`/auto-request/${lastRequest.id}`)}
                  style={[
                    styles.lastReqCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.lastReqHead}>
                    <Text style={[styles.lastReqLabel, { color: colors.textSecondary }]}>
                      {t('profile_hub.last_request')}
                    </Text>
                    <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.lastReqTitle, { color: colors.text }]} numberOfLines={1}>
                    {[lastRequest.brand, lastRequest.model].filter(Boolean).join(' ') ||
                      t('requests_tab.fallback_title')}
                    {lastRequest.city ? ` · ${lastRequest.city}` : ''}
                  </Text>
                  <Text style={[styles.lastReqStatus, { color: colors.primary }]}>
                    {t(`requests_tab.status_${lastRequest.status}`, {
                      defaultValue: lastRequest.status,
                    })}
                    {lastRequest.urgency
                      ? ` · ${t('profile_hub.urgency_label')}: ${t(
                          `profile_hub.urgency_${lastRequest.urgency}`,
                          { defaultValue: lastRequest.urgency }
                        )}`
                      : ''}
                  </Text>

                  {/* 4-step progress timeline — Paid → Inspector → Visit → Report */}
                  <Timeline
                    currentStep={STATUS_TO_STEP[lastRequest.status] ?? 0}
                    labels={[
                      t('profile_hub.timeline_paid'),
                      t('profile_hub.timeline_match'),
                      t('profile_hub.timeline_visit'),
                      t('profile_hub.timeline_report'),
                    ]}
                    activeColor={colors.primary}
                    doneColor="#10B981"
                    inactiveColor={colors.border}
                    textColor={colors.textSecondary}
                  />

                  <View style={styles.lastReqCta}>
                    <Text style={[styles.lastReqCtaText, { color: colors.primary }]}>
                      {t('profile_hub.view_request')}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              ) : (
                /* Empty state — compact, modern: small inline icon + tight copy + slim CTA. */
                <View
                  testID="next-action-card"
                  style={[
                    styles.nextActionCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.nextActionRow}>
                    <View style={[styles.nextActionIconBox, { backgroundColor: 'rgba(245,184,0,0.12)' }]}>
                      <Ionicons name="search" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nextActionTitle, { color: colors.text }]} numberOfLines={1}>
                        {t('profile_hub.no_last_request_title')}
                      </Text>
                      <Text style={[styles.nextActionBody, { color: colors.textSecondary }]} numberOfLines={2}>
                        {t('profile_hub.no_last_request_sub')}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    testID="next-action-primary"
                    activeOpacity={0.85}
                    onPress={() => router.push('/auto-request/create?type=inspection')}
                    style={[styles.nextActionCta, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#0B0B0B" />
                    <Text style={styles.nextActionCtaText}>{t('profile_hub.cta_inspect').replace(/^[+\s]+/, '')}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#0B0B0B" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ════════ PRIMARY ACTIONS — only when there IS a last request ════════ */}
          {user && !isInspector && lastRequest && (
            <View style={styles.primaryActionsBox} testID="primary-actions">
              <TouchableOpacity
                testID="cta-inspect"
                activeOpacity={0.85}
                onPress={() => router.push('/auto-request/create?type=inspection')}
                style={[styles.ctaPrimary, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.ctaPrimaryText}>{t('profile_hub.cta_inspect')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ════════ INSPECTOR ACTIONS — moved into dashboard above ════════ */}

          {/* ════════ CLIENT EXTRAS — History + Saved cars ════════ */}
          {user && !isInspector && (
            <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ListRow
                testID="client-history"
                icon="time"
                color="#3B82F6"
                title={t('profile_hub.history_title')}
                sub={t('profile_hub.history_sub')}
                onPress={() => router.push('/(tabs)/reports')}
                colors={colors}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ListRow
                testID="client-favorites-cars"
                icon="heart"
                color="#EF4444"
                title={t('profile_hub.favorites_cars')}
                sub={t('profile_hub.favorites_cars_sub')}
                onPress={() => router.push('/favorites')}
                colors={colors}
              />
            </View>
          )}

          {/* "Зарабатывайте с нами" для клиента = РЕФЕРАЛЬНАЯ программа (пригласи друзей, получи бонус).
              НЕ предлагаем существующему клиенту регистрироваться повторно как inspector — это смешение ролей. */}

          {/* ════════ REFERRAL — always visible for clients ════════ */}
          {user && !isInspector && (
            <TouchableOpacity
              testID="profile-referral-banner"
              onPress={() => router.push('/referral')}
              activeOpacity={0.9}
              style={[styles.referralBanner, { borderColor: 'rgba(245,184,0,0.4)' }]}
            >
              <Text style={{ fontSize: 28 }}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.referralTitle, { color: colors.text }]}>
                  {t('profile_hub.referral_title')}
                </Text>
                <Text style={[styles.referralSub, { color: colors.textSecondary }]}>
                  {t('profile_hub.referral_sub')}
                </Text>
              </View>
              <View style={[styles.referralCta, { backgroundColor: colors.primary }]}>
                <Text style={styles.referralCtaText}>{t('profile_hub.referral_cta')}</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* ════════ SETTINGS — bottom, secondary ════════ */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('profile_hub.settings_title')}
          </Text>
          <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {accounts.length >= 2 && activeAccount && (
              <>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setShowAccountSwitcher(true)}
                  activeOpacity={0.7}
                  testID="settings-work-mode"
                >
                  <View style={[styles.settingsIconWrap, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
                    <Ionicons name="swap-horizontal" size={18} color="#A855F7" />
                  </View>
                  <Text style={[styles.settingsLabel, { color: colors.text }]}>
                    {t('workMode.title')}
                  </Text>
                  <View style={styles.settingsValue}>
                    <Text
                      style={[styles.settingsValueText, { color: colors.textSecondary }]}
                      numberOfLines={1}
                      testID="settings-work-mode-current"
                    >
                      {t(`workMode.kind.${activeAccount.kind}`)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </>
            )}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => setShowLanguageModal(true)}
              activeOpacity={0.7}
              testID="settings-language"
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: 'rgba(245,184,0,0.15)' }]}>
                <Ionicons name="language" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t('profile.language')}
              </Text>
              <View style={styles.settingsValue}>
                <Text style={[styles.settingsValueText, { color: colors.textSecondary }]}>
                  {currentLang.flag} {currentLang.name}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.settingsRow}>
              <View style={[styles.settingsIconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={18} color="#3B82F6" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t('profile.theme')}
              </Text>
              <View style={styles.themeToggle}>
                <Text style={[styles.themeLabel, { color: colors.textSecondary }]}>
                  {isDark ? t('profile.darkTheme') : t('profile.lightTheme')}
                </Text>
                <Switch
                  value={isDark}
                  onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={'#FFFFFF'}
                />
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
              testID="settings-notifications"
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Ionicons name="notifications" size={18} color="#F59E0B" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t('profile.notifications')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/help')}
              activeOpacity={0.7}
              testID="settings-help"
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <Ionicons name="help-circle" size={18} color="#10B981" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t('profile_hub.settings_help')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/support')}
              activeOpacity={0.7}
              testID="settings-support"
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                <Ionicons name="chatbubble-ellipses" size={18} color="#8B5CF6" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t('profile_hub.settings_support')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ════════ LOGOUT ════════ */}
          {user && (
            <TouchableOpacity
              testID="profile-logout"
              style={[
                styles.logoutButton,
                { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.4)' },
              ]}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={[styles.logoutText, { color: '#EF4444' }]}>{t('profile.logout')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ════════ Sprint 1E — Account switcher (Work mode) ════════ */}
      <AccountSwitcherModal
        visible={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
      />

      {/* ════════ Language modal ════════ */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLanguageModal(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.language')}</Text>
            {LANGUAGES.map((lang) => {
              const active = lang.code === language;
              return (
                <TouchableOpacity
                  key={lang.code}
                  testID={`lang-modal-${lang.code}`}
                  style={[
                    styles.langRow,
                    { borderColor: colors.border },
                    active && { backgroundColor: 'rgba(245,184,0,0.10)' },
                  ]}
                  onPress={() => {
                    setLanguage(lang.code);
                    setShowLanguageModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
                  <Text style={[styles.langName, { color: colors.text }]}>{lang.name}</Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════════ Logout confirm modal (web) ════════ */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLogoutModal(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.logout')}</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              {t('profile.logout_confirm_body')}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#EF4444' }]}
                onPress={performLogout}
              >
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>{t('profile.logout')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Reusable inner components ─────────────────────────────────────────────
function RequestChip(props: {
  testID: string;
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  cardBg: string;
  border: string;
  textColor: string;
  subColor: string;
}) {
  return (
    <TouchableOpacity
      testID={props.testID}
      onPress={props.onPress}
      activeOpacity={0.85}
      style={[styles.chip, { backgroundColor: props.cardBg, borderColor: props.border }]}
    >
      <View style={[styles.chipIconBox, { backgroundColor: `${props.color}25` }]}>
        <Ionicons name={props.icon} size={16} color={props.color} />
      </View>
      <Text style={[styles.chipCount, { color: props.textColor }]}>{props.count}</Text>
      <Text style={[styles.chipLabel, { color: props.subColor }]} numberOfLines={1}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

function ListRow(props: {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  sub?: string;
  onPress: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      testID={props.testID}
      style={styles.settingsRow}
      onPress={props.onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.settingsIconWrap, { backgroundColor: `${props.color}25` }]}>
        <Ionicons name={props.icon} size={18} color={props.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingsLabel, { color: props.colors.text }]}>{props.title}</Text>
        {!!props.sub && (
          <Text style={[styles.settingsSub, { color: props.colors.textSecondary }]} numberOfLines={1}>
            {props.sub}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={props.colors.textSecondary} />
    </TouchableOpacity>
  );
}

/**
 * Compact 4-step progress strip used inside LastRequestCard.
 * - Steps before `currentStep` are "done" (green)
 * - Step at `currentStep` is "active" (yellow, pulsing-ish via solid fill)
 * - Steps after are "inactive" (subtle grey)
 */
function Timeline(props: {
  currentStep: number;
  labels: string[];
  activeColor: string;
  doneColor: string;
  inactiveColor: string;
  textColor: string;
}) {
  return (
    <View style={styles.timelineRow} testID="profile-timeline">
      {props.labels.map((label, idx) => {
        const isDone = idx < props.currentStep;
        const isActive = idx === props.currentStep;
        const dotColor = isDone ? props.doneColor : isActive ? props.activeColor : props.inactiveColor;
        const labelColor = isDone || isActive ? props.activeColor : props.textColor;
        return (
          <React.Fragment key={idx}>
            <View style={styles.timelineStep}>
              <View
                style={[
                  styles.timelineDot,
                  {
                    backgroundColor: dotColor,
                    borderColor: dotColor,
                    transform: [{ scale: isActive ? 1.15 : 1 }],
                  },
                ]}
              >
                {isDone && <Ionicons name="checkmark" size={10} color="#FFF" />}
              </View>
              <Text
                style={[styles.timelineLabel, { color: labelColor }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {idx < props.labels.length - 1 && (
              <View
                style={[
                  styles.timelineConnector,
                  { backgroundColor: idx < props.currentStep ? props.doneColor : props.inactiveColor },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 80 },
  headerRow: { marginBottom: 18 },
  headerTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    gap: 14,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 17, fontWeight: '800' },
  userEmail: { fontSize: 13 },
  loginLink: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  statsCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  inspectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 6,
  },
  inspectorCell: {
    width: '50%',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inspectorActions: { gap: 10, marginTop: 14, marginBottom: 14 },
  inspectorActionsRow: { flexDirection: 'row', gap: 10 },
  inspectorSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  publicProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  publicProfileText: { flex: 1, fontSize: 14, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'stretch' },
  statBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '900' },
  statsMotivator: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 0.3,
  },

  greetingStrip: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 4,
  },
  greetingTitle: { fontSize: 15, fontWeight: '800' },
  greetingSub: { fontSize: 12, lineHeight: 16 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    marginTop: 8,
    marginBottom: 10,
  },

  chipsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  chip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
  },
  chipIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCount: { fontSize: 22, fontWeight: '900' },
  chipLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  lastReqCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  lastReqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastReqLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  lastReqTitle: { fontSize: 17, fontWeight: '800' },
  lastReqStatus: { fontSize: 13, fontWeight: '600' },
  lastReqCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  lastReqCtaText: { fontSize: 13, fontWeight: '800' },

  primaryActionsBox: { gap: 10, marginBottom: 18 },
  ctaPrimary: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaPrimaryText: { color: '#0B0B0B', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  ctaSecondary: {
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  ctaSecondaryText: { fontSize: 15, fontWeight: '800' },
  ctaLink: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaLinkText: { fontSize: 14, fontWeight: '700' },

  nextActionCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  nextActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextActionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionTitle: { fontSize: 15, fontWeight: '800' },
  nextActionBody: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  nextActionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  nextActionCtaText: { color: '#0B0B0B', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },

  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  timelineStep: { alignItems: 'center', gap: 4, minWidth: 50 },
  timelineDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLabel: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  timelineConnector: { flex: 1, height: 2, marginHorizontal: 2, marginBottom: 14 },

  listCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  settingsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  settingsSub: { fontSize: 11, marginTop: 2 },
  settingsValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingsValueText: { fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  themeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  themeLabel: { fontSize: 12 },

  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginBottom: 16,
  },
  upgradeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,184,0,0.15)',
  },
  upgradeTitle: { fontSize: 15, fontWeight: '800' },
  upgradeKicker: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  upgradeSub: { fontSize: 12, marginTop: 2 },

  // Demoted "Become Inspector" — small list row, NOT a hero CTA
  becomeInspectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    marginBottom: 12,
  },
  becomeInspectorText: { flex: 1, fontSize: 13, fontWeight: '500' },

  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(245,184,0,0.10)',
    borderWidth: 1,
    marginBottom: 16,
  },
  referralTitle: { fontSize: 14, fontWeight: '800' },
  referralSub: { fontSize: 11, marginTop: 2 },
  referralCta: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  referralCtaText: { color: '#0B0B0B', fontSize: 12, fontWeight: '900', letterSpacing: 0.3 },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
  },
  logoutText: { fontSize: 14, fontWeight: '800' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  modalBody: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 14, fontWeight: '800' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
    marginVertical: 2,
  },
  langName: { flex: 1, fontSize: 15, fontWeight: '700' },

  // Package card (client only) — shows balance / used / total + buy CTA
  packageCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  packageHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  packageIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageTitle: { flex: 1, fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  packageBuy: { fontSize: 13, fontWeight: '800' },
  packageStatsRow: { flexDirection: 'row', alignItems: 'stretch' },
  packageStatBlock: { flex: 1, alignItems: 'center', gap: 4 },
  packageStatDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 4 },
  packageStatValue: { fontSize: 24, fontWeight: '900' },
  packageStatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  packageBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  packageBarFill: { height: '100%', borderRadius: 3 },
  packageEmpty: { alignItems: 'center', gap: 4, paddingVertical: 6 },
  packageEmptyTitle: { fontSize: 14, fontWeight: '800' },
  packageEmptySub: { fontSize: 12, textAlign: 'center' },
});
