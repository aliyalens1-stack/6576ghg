import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import { useTranslation } from 'react-i18next';

const FAQ_ITEMS_KEYS = [
  'how_quick_request',
  'who_master',
  'price_calc',
  'cancel_request',
  'contact_master',
  'safety',
  'payment',
  'reviews',
];

export default function HelpScreen() {
  const router = useRouter();
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          testID="help-back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.backgroundTertiary }]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('help.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          {t('help.intro')}
        </Text>

        {FAQ_ITEMS_KEYS.map((k, idx) => {
          const isOpen = openIdx === idx;
          return (
            <TouchableOpacity
              key={k}
              testID={`faq-item-${k}`}
              activeOpacity={0.85}
              onPress={() => setOpenIdx(isOpen ? null : idx)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.q, { color: colors.text }]}>
                  {t(`help.faq.${k}.q`)}
                </Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.textMuted}
                />
              </View>
              {isOpen && (
                <Text style={[styles.a, { color: colors.textSecondary }]}>
                  {t(`help.faq.${k}.a`)}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          testID="help-contact-support"
          style={[styles.cta, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/support')}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.onPrimary || '#000'} />
          <Text style={[styles.ctaText, { color: colors.onPrimary || '#000' }]}>
            {t('help.contact_support_cta')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  card: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  q: { flex: 1, fontSize: 15, fontWeight: '600' },
  a: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 24, paddingVertical: 14, borderRadius: 14,
  },
  ctaText: { fontSize: 15, fontWeight: '700' },
});
