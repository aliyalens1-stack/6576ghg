import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';
import { ThemeProvider, useThemeContext } from '../src/context/ThemeContext';
import { LocationProvider } from '../src/context/LocationContext';
import { CityProvider, useCity } from '../src/context/CityContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// init i18next (sets up resources, language, persistence)
import '../src/i18n';
import { theme } from '../src/context/ThemeContext';
const colors = theme.colors;

function LoadingScreen() {
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  return (
    <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
        {t('app.loading')}
      </Text>
    </View>
  );
}

/**
 * Stage 2 — Onboarding gate.
 * If city has never been selected → redirect to /city-select before showing the app.
 * Skipped on welcome (/) and city-select itself to avoid loops.
 */
function CityOnboardingGate({ children }: { children: React.ReactNode }) {
  const { loading, hasSelected } = useCity();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (hasSelected) return;
    const path = '/' + segments.join('/');
    // Allow welcome, login, register, city-select, forgot-password, invite,
    // and the auto-request choose screen (Phase 3.0a — pre-form scenario picker)
    // without forcing city pick. The form itself collects city.
    const passThrough = [
      '/', '/login', '/register', '/city-select', '/forgot-password', '/invite',
      '/auto-request/choose', '/auto-request/create',
      // Phase 3.0b P0-1 — payment funnel reachable for guests without city onboarding
      '/payment-success', '/payment-cancelled',
      // P1.5 — free risk preview reachable from link paste before city pick
      '/inspection-preview',
      // Phase C.3 — Provider Workspace + Customer Comparison reachable for guests
      '/provider/workspace',
      '/dashboard/requests',
    ];
    if (passThrough.some((p) => path === p || path.startsWith(p + '/'))) return;
    router.replace('/city-select?redirect=/(tabs)' as any);
  }, [loading, hasSelected, segments, router]);

  return <>{children}</>;
}

function RootLayoutNav() {
  const { colors, isDark } = useThemeContext();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <CityOnboardingGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        />
      </CityOnboardingGate>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <LocationProvider>
            <CityProvider>
              <ToastProvider>
                <RootLayoutNav />
              </ToastProvider>
            </CityProvider>
          </LocationProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
