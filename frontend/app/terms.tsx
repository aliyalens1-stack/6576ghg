import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import { useTranslation } from 'react-i18next';

const TERMS_SECTIONS = [
  'acceptance', 'service_description', 'accounts', 'user_obligations',
  'payments', 'cancellation', 'liability', 'changes', 'governing_law', 'contact',
];

export default function TermsScreen() {
  const router = useRouter();
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          testID="terms-back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.backgroundTertiary }]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('terms.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[styles.lastUpdated, { color: colors.textMuted }]}>
          {t('terms.last_updated')}: 01.05.2026
        </Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          {t('terms.intro')}
        </Text>

        {TERMS_SECTIONS.map((sec, i) => (
          <View key={sec} style={styles.section}>
            <Text style={[styles.sectionNum, { color: colors.primary }]}>{i + 1}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t(`terms.sections.${sec}.title`)}
              </Text>
              <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
                {t(`terms.sections.${sec}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  lastUpdated: { fontSize: 12, marginBottom: 12 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  section: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  sectionNum: { fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  sectionBody: { fontSize: 14, lineHeight: 20 },
});
