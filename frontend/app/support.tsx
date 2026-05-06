import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import { useTranslation } from 'react-i18next';

const SUPPORT_EMAIL = 'support@autoservice.com';
const SUPPORT_PHONE = '+380 44 555-00-00';

export default function SupportScreen() {
  const router = useRouter();
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleEmail = async () => {
    const subj = encodeURIComponent(subject || 'Support');
    const body = encodeURIComponent(message);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subj}&body=${body}`;
    try { await Linking.openURL(url); } catch {}
  };
  const handleCall = async () => {
    try { await Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`); } catch {}
  };
  const handleSend = async () => {
    if (!message.trim()) {
      Alert.alert(t('common.error'), t('support.message_required'));
      return;
    }
    setSending(true);
    // Send via mailto fallback (no backend ticket endpoint yet)
    await handleEmail();
    setSending(false);
    setSubject('');
    setMessage('');
    Alert.alert(t('support.sent_title'), t('support.sent_body'));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          testID="support-back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.backgroundTertiary }]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('support.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {t('support.intro')}
          </Text>

          <View style={styles.row}>
            <TouchableOpacity
              testID="support-email-btn"
              style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleEmail}
              activeOpacity={0.85}
            >
              <Ionicons name="mail" size={22} color={colors.primary} />
              <Text style={[styles.tileLabel, { color: colors.text }]}>{t('support.email')}</Text>
              <Text style={[styles.tileVal, { color: colors.textSecondary }]}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="support-call-btn"
              style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleCall}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={22} color={colors.success} />
              <Text style={[styles.tileLabel, { color: colors.text }]}>{t('support.call')}</Text>
              <Text style={[styles.tileVal, { color: colors.textSecondary }]}>{SUPPORT_PHONE}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: colors.textMuted }]}>{t('support.subject_label')}</Text>
          <TextInput
            testID="support-subject"
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder={t('support.subject_placeholder')}
            placeholderTextColor={colors.textMuted}
            value={subject}
            onChangeText={setSubject}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('support.message_label')}</Text>
          <TextInput
            testID="support-message"
            style={[styles.input, styles.textarea, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder={t('support.message_placeholder')}
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <TouchableOpacity
            testID="support-send-btn"
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={handleSend}
            disabled={sending}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color={colors.onPrimary || '#000'} />
            <Text style={[styles.ctaText, { color: colors.onPrimary || '#000' }]}>
              {sending ? t('support.sending') : t('support.send')}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.note, { color: colors.textMuted }]}>
            {t('support.eta_note')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tile: {
    flex: 1, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start', gap: 6,
  },
  tileLabel: { fontSize: 13, fontWeight: '700' },
  tileVal: { fontSize: 12 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 6 },
  input: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  textarea: { minHeight: 120, paddingTop: 12 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16, paddingVertical: 14, borderRadius: 14,
  },
  ctaText: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 12, marginTop: 12, textAlign: 'center' },
});
