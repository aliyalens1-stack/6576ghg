// ═════════════════════════════════════════════════════════
// 🏠 Welcome — clean, readable, breathable layout (re-do)
// Sprint UI fix: kicker single-line, cards have proper line-height,
// hints capped at numberOfLines=2, generous spacing (8pt grid 16/24/32).
// ═════════════════════════════════════════════════════════
import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import Text from '../src/components/ui/Text';
import Brand from '../src/components/Brand';
import LanguageSwitcher from '../src/components/LanguageSwitcher';
import { tokens } from '../src/theme/tokens';

export default function WelcomeScreen() {
  const { colors, isDark } = useThemeContext();
  const router = useRouter();
  const auth = useAuth();
  const { t } = useTranslation();
  const styles = makeStyles(colors, isDark);

  // Already logged in → skip
  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated && auth.user) {
      router.replace('/(tabs)');
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.user, router]);

  const goLogin = () => router.push('/login');
  const goGuest = async () => { await auth.continueAsGuest(); router.replace('/(tabs)'); };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']} testID="welcome-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* HEADER */}
        <View style={styles.topRow}>
          <Brand height={26} testID="welcome-logo" />
          <LanguageSwitcher />
        </View>

        {/* HERO */}
        <View style={styles.heroBlock}>
          <View style={styles.kickerRow}>
            <View style={styles.kickerDot} />
            <Text
              variant="kicker"
              tone="brand"
              testID="welcome-kicker"
              numberOfLines={1}
              style={styles.kickerText}
            >
              {t('welcome.kicker')}
            </Text>
          </View>

          <Text variant="h1" testID="welcome-title" style={styles.title}>
            {t('welcome.title_v2')}
          </Text>

          <Text
            variant="body"
            tone="muted"
            testID="welcome-subtitle"
            style={styles.subtitle}
          >
            {t('welcome.subtitle_v2')}
          </Text>
        </View>

        {/* ACTIONS — Phase 3.0a: single primary CTA + onboarding-style secondary.
            Choice (inspection vs selection) is moved to /auto-request/choose.
            Repair drops out of CORE flow → moved to tertiary Additional link below. */}
        <View style={styles.actions}>
          <ActionCard
            primary
            icon="car-sport"
            title={t('welcome.primary_cta')}
            hint={t('welcome.subtitle_fear')}
            onPress={() => router.push('/auto-request/choose')}
            testID="welcome-find-car"
            colors={colors}
            isDark={isDark}
          />
          <ActionCard
            icon="briefcase-outline"
            title={t('welcome.secondary_cta')}
            hint={t('welcome.start_earning_hint')}
            onPress={() => router.push('/register?role=provider')}
            testID="welcome-become-inspector"
            colors={colors}
            isDark={isDark}
          />
        </View>

        {/* TRUST SIGNALS — Phase 3.0b STEP-1: honest trust block (no fake numbers).
            Sits between primary actions and secondary auth so users see it before
            they decide to leave. */}
        <View style={styles.trustBlock} testID="welcome-trust-block">
          <TrustItem icon="shield-checkmark" title={t('trust.tuv_inspection')} sub={t('trust.tuv_inspection_sub')} colors={colors} isDark={isDark} testID="trust-tuv" />
          <TrustItem icon="people"             title={t('trust.local_inspectors')} sub={t('trust.local_inspectors_sub')} colors={colors} isDark={isDark} testID="trust-local" />
          <TrustItem icon="time"               title={t('trust.reports_24h')}      sub={t('trust.reports_24h_sub')}      colors={colors} isDark={isDark} testID="trust-24h" />
          <TrustItem icon="camera"             title={t('trust.photo_video_proof')} sub={t('trust.photo_video_proof_sub')} colors={colors} isDark={isDark} testID="trust-proof" />
        </View>

        {/* SECONDARY (auth + tertiary additional services) */}
        <View style={styles.secondary}>
          <TouchableOpacity
            style={styles.repairLink}
            onPress={async () => { await auth.continueAsGuest(); router.push('/additional'); }}
            testID="welcome-additional-link"
          >
            <Ionicons name="ellipsis-horizontal-circle-outline" size={14} color={colors.textSecondary} />
            <Text variant="caption" tone="muted" weight="700">
              {t('welcome.tertiary_text')}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.loginButton} onPress={goLogin} testID="welcome-login-link">
            <Text variant="body" weight="800" align="center">
              {t('welcome.have_account_login')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={goGuest} testID="welcome-skip">
            <Text variant="caption" tone="muted" weight="700" align="center">
              {t('welcome.continue_as_guest')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Trust Item (compact icon + title + sub) ────────────────────────
function TrustItem({
  icon, title, sub, colors, isDark, testID,
}: {
  icon: any; title: string; sub: string;
  colors: any; isDark: boolean; testID: string;
}) {
  return (
    <View style={trustStyles(colors, isDark).row} testID={testID}>
      <View style={trustStyles(colors, isDark).iconBox}>
        <Ionicons name={icon} size={16} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="caption" weight="800" style={{ color: colors.text }}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" style={trustStyles(colors, isDark).sub}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

function trustStyles(colors: any, _isDark: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 8,
    },
    iconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    sub: { lineHeight: 16, marginTop: 1 },
  });
}

// ─── Reusable Action Card ────────────────────────────────────────────
function ActionCard({
  icon, title, hint, onPress, testID, primary = false, colors, isDark,
}: {
  icon: any; title: string; hint: string;
  onPress: () => void; testID: string; primary?: boolean;
  colors: any; isDark: boolean;
}) {
  const styles = makeStyles(colors, isDark);
  return (
    <TouchableOpacity
      style={primary ? styles.primaryCard : styles.secondaryCard}
      activeOpacity={0.85}
      onPress={onPress}
      testID={testID}
    >
      <View style={primary ? styles.primaryIcon : styles.secondaryIcon}>
        <Ionicons
          name={icon}
          size={primary ? 22 : 20}
          color={primary ? tokens.colors.onBrand : colors.brand}
        />
      </View>
      <View style={styles.cardTextBlock}>
        <Text
          variant="h3"
          weight={primary ? '900' : '800'}
          numberOfLines={2}
          style={primary ? styles.primaryTitle : undefined}
        >
          {title}
        </Text>
        <Text
          variant="caption"
          weight="600"
          tone={primary ? undefined : 'muted'}
          numberOfLines={2}
          style={[styles.cardHint, primary && styles.primaryHint]}
        >
          {hint}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={primary ? tokens.colors.onBrand : colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 32,
      maxWidth: 460,
      width: '100%',
      alignSelf: 'center',
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 32,
    },

    // HERO
    heroBlock: {
      marginBottom: 32,
    },
    kickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    kickerDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.brand,
    },
    kickerText: {
      flexShrink: 1,
      letterSpacing: 1.5,
    },
    title: {
      marginBottom: 14,
      lineHeight: 44,
    },
    subtitle: {
      lineHeight: 22,
      maxWidth: 380,
    },
    subtitleFear: {
      marginTop: 10,
      color: colors.brand,
      letterSpacing: 0.2,
      lineHeight: 18,
      maxWidth: 380,
    },

    // ACTIONS
    actions: { gap: 12, marginBottom: 24 },

    // TRUST BLOCK
    trustBlock: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: tokens.radius.lg,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 8,
      gap: 4,
    },

    primaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.brand,
      borderRadius: tokens.radius.lg,
      paddingVertical: 18,
      paddingHorizontal: 18,
      ...Platform.select({
        ios: {
          shadowColor: colors.brand,
          shadowOpacity: isDark ? 0.32 : 0.22,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        },
        android: { elevation: 6 },
        default: {},
      }),
    },
    primaryIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryTitle: { color: tokens.colors.onBrand },
    primaryHint: { color: tokens.colors.onBrand, opacity: 0.82 },

    secondaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: tokens.radius.lg,
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    secondaryIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextBlock: { flex: 1, gap: 3 },
    cardHint: { lineHeight: 16 },

    // SECONDARY
    secondary: { marginTop: 8 },
    repairLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    loginButton: { paddingVertical: 14 },
    skipButton: { paddingVertical: 8, marginTop: 4 },
  });
}
