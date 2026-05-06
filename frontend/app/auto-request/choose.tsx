// Phase 3.0a — Welcome funnel split: customer chooses inspection vs selection.
// Replaces previous welcome dead-end where two different CTAs both routed to
// /auto-request/create with no type pre-selected. Now type=inspection|selection
// is set BEFORE the form, so the form can adapt (skip irrelevant steps).
import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../../src/context/ThemeContext';
import Text from '../../src/components/ui/Text';
import { tokens } from '../../src/theme/tokens';

export default function ChooseRequestType() {
  const router = useRouter();
  const { colors, isDark } = useThemeContext();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']} testID="choose-request-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="choose-back" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text variant="kicker" tone="brand" testID="choose-kicker" numberOfLines={1} style={styles.kicker}>
          {t('welcome.kicker')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text variant="h1" testID="choose-title" style={styles.title}>
          {t('choose.title')}
        </Text>

        <ChoiceCard
          icon="shield-checkmark"
          title={t('choose.inspection_title')}
          hint={t('choose.inspection_hint')}
          sub={t('choose.inspection_sub')}
          onPress={() => router.push('/auto-request/create?type=inspection')}
          testID="choose-inspection"
          colors={colors}
          isDark={isDark}
          tagText="€149"
        />

        <ChoiceCard
          icon="search"
          title={t('choose.selection_title')}
          hint={t('choose.selection_hint')}
          sub={t('choose.selection_sub')}
          onPress={() => router.push('/auto-request/create?type=selection')}
          testID="choose-selection"
          colors={colors}
          isDark={isDark}
          tagText={t('welcome.request_selection_hint')}
          tagSmall
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceCard({
  icon, title, hint, sub, onPress, testID, colors, isDark, tagText, tagSmall = false,
}: {
  icon: any; title: string; hint: string; sub?: string; onPress: () => void; testID: string;
  colors: any; isDark: boolean; tagText?: string; tagSmall?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.85}
      onPress={onPress}
      testID={testID}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={icon} size={28} color={colors.brand} />
      </View>
      <View style={styles.cardBody}>
        <Text variant="h3" weight="800" style={{ color: colors.text }}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" style={styles.cardHint}>
          {hint}
        </Text>
        {sub ? (
          <Text variant="caption" weight="700" style={[styles.cardSub, { color: colors.brand }]} testID={`${testID}-sub`}>
            {sub}
          </Text>
        ) : null}
        {tagText ? (
          <View style={[styles.tag, { backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.14)' }]}>
            <Text variant="caption" weight="800" style={[styles.tagText, tagSmall && { fontSize: 10 }]}>
              {tagText}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  kicker: { letterSpacing: 1.5, flexShrink: 1 },
  body: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40, maxWidth: 460, width: '100%', alignSelf: 'center' },
  title: { marginBottom: 28, lineHeight: 38 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  iconBox: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 4 },
  cardHint: { lineHeight: 17 },
  cardSub: { marginTop: 6, lineHeight: 17, letterSpacing: 0.2 },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 8,
  },
  tagText: { color: '#F59E0B', fontSize: 11, letterSpacing: 0.3 },
});
