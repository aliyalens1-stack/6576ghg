/**
 * /provider/clusters — Sprint 33 C7.2
 *
 * Provider chooses which markets they work in (Repair / Inspection /
 * Selection / Delivery) + per-cluster credentials (TUV cert, years exp,
 * brands, insurance #, etc.). Saves via PATCH /api/provider/profile/clusters.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useThemeContext } from '../../src/context/ThemeContext';
import { theme } from '../../src/context/ThemeContext';
const colors = theme.colors;

const API = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type ClusterId = 'repair' | 'inspection' | 'selection' | 'delivery';

interface ClusterDef {
  id: ClusterId;
  title: string;
  emoji: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; numeric?: boolean }[];
}

const CLUSTER_DEFS: ClusterDef[] = [
  {
    id: 'repair',
    title: 'Ремонт авто',
    emoji: '🔧',
    description: 'СТО / диагностика / срочный ремонт',
    fields: [
      { key: 'specialization', label: 'Специализация', placeholder: 'Ходовая, тормоза, электрика…' },
      { key: 'yearsExperience', label: 'Опыт (лет)', placeholder: '5', numeric: true },
    ],
  },
  {
    id: 'inspection',
    title: 'Проверка перед покупкой',
    emoji: '🔍',
    description: 'Pre-purchase inspection / TÜV / DEKRA',
    fields: [
      { key: 'certification', label: 'Сертификация', placeholder: 'TÜV / DEKRA' },
      { key: 'yearsExperience', label: 'Опыт осмотров (лет)', placeholder: '5', numeric: true },
      { key: 'cities', label: 'Города (через запятую)', placeholder: 'Berlin, Hamburg' },
    ],
  },
  {
    id: 'selection',
    title: 'Подбор авто',
    emoji: '🎯',
    description: 'Подбор под бюджет / эксперт',
    fields: [
      { key: 'yearsExperience', label: 'Опыт подбора (лет)', placeholder: '5', numeric: true },
      { key: 'brands', label: 'Марки (через запятую)', placeholder: 'BMW, Audi, VW' },
      { key: 'minBudget', label: 'Минимальный бюджет (€)', placeholder: '5000', numeric: true },
    ],
  },
  {
    id: 'delivery',
    title: 'Пригон / доставка',
    emoji: '🚛',
    description: 'Транспортировка авто из ЕС',
    fields: [
      { key: 'license', label: 'Лицензия / страховка #', placeholder: 'DE-INS-12345' },
      { key: 'countries', label: 'Страны (через запятую)', placeholder: 'DE, PL, UA' },
      { key: 'avgDaysDelivery', label: 'Средний срок (дней)', placeholder: '7', numeric: true },
    ],
  },
];

export default function ProviderClustersScreen() {
  const router = useRouter();
  const { theme } = useThemeContext();
  const palette = theme === 'dark'
    ? { bg: colors.bg, surface: colors.backgroundSecondary, text: colors.text, textMuted: colors.textMuted, border: colors.border, primary: colors.brand, onPrimary: colors.text }
    : { bg: colors.backgroundTertiary, surface: colors.text, text: colors.brandText, textMuted: colors.textMuted, border: colors.border, primary: colors.brand, onPrimary: colors.text };
  const styles = useMemo(() => makeStyles(palette), [theme]);

  const [providerSlug, setProviderSlug] = useState<string>('');
  const [active, setActive] = useState<Record<ClusterId, boolean>>({ repair: false, inspection: false, selection: false, delivery: false });
  const [profile, setProfile] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async (slug: string) => {
    try {
      const res = await axios.get(`${API}/api/provider/profile/clusters`, { params: { providerSlug: slug } });
      const cl = (res.data?.clusters || []) as ClusterId[];
      setActive({
        repair:     cl.includes('repair'),
        inspection: cl.includes('inspection'),
        selection:  cl.includes('selection'),
        delivery:   cl.includes('delivery'),
      });
      const cp = res.data?.clusterProfile || {};
      // Convert any array values back to comma-strings for editing
      const formProfile: Record<string, Record<string, string>> = {};
      Object.entries(cp).forEach(([k, v]: [string, any]) => {
        formProfile[k] = {};
        Object.entries(v || {}).forEach(([fk, fv]: [string, any]) => {
          formProfile[k][fk] = Array.isArray(fv) ? fv.join(', ') : String(fv ?? '');
        });
      });
      setProfile(formProfile);
    } catch (e: any) {
      console.log('load profile error', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Resolve provider slug — from AsyncStorage or first seeded provider for testing
      const stored = await AsyncStorage.getItem('provider_slug');
      const slug = stored || 'avtomaster-pro';
      setProviderSlug(slug);
      await loadProfile(slug);
    })();
  }, [loadProfile]);

  const toggle = (id: ClusterId) => {
    setActive((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setField = (cluster: ClusterId, field: string, val: string) => {
    setProfile((prev) => ({ ...prev, [cluster]: { ...(prev[cluster] || {}), [field]: val } }));
  };

  const handleSave = async () => {
    const clusters = (Object.keys(active) as ClusterId[]).filter((k) => active[k]);
    if (clusters.length === 0) {
      Alert.alert('Выберите хотя бы один рынок');
      return;
    }
    // Build cluster profile — split commas into arrays for known fields
    const cp: Record<string, Record<string, any>> = {};
    for (const c of clusters) {
      const def = CLUSTER_DEFS.find((d) => d.id === c)!;
      const values = profile[c] || {};
      const out: Record<string, any> = {};
      for (const f of def.fields) {
        const raw = values[f.key];
        if (raw === undefined || raw === '') continue;
        if (f.numeric) out[f.key] = parseFloat(raw) || raw;
        else if (['cities', 'brands', 'countries'].includes(f.key)) out[f.key] = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
        else out[f.key] = raw;
      }
      if (Object.keys(out).length) cp[c] = out;
    }
    setSaving(true);
    try {
      const res = await axios.patch(`${API}/api/provider/profile/clusters`, {
        providerSlug,
        clusters,
        clusterProfile: cp,
      });
      Alert.alert('Сохранено', `Активные рынки: ${(res.data?.clusters || []).join(', ')}`);
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Не удалось сохранить';
      Alert.alert('Ошибка', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={palette.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="clusters-back">
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>МОИ РЫНКИ</Text>
          <Text style={styles.title}>В каких рынках работаете?</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>Выберите специализации — вы будете получать только подходящие заявки и видеть аукцион в этих кластерах.</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {CLUSTER_DEFS.map((d) => {
          const isOn = active[d.id];
          return (
            <View key={d.id} style={[styles.card, isOn && styles.cardActive]}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => toggle(d.id)} style={styles.cardHeader} testID={`cluster-toggle-${d.id}`}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.emoji}>{d.emoji}</Text>
                  <View>
                    <Text style={styles.cardTitle}>{d.title}</Text>
                    <Text style={styles.cardDesc}>{d.description}</Text>
                  </View>
                </View>
                <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                  {isOn ? <Ionicons name="checkmark" size={18} color={palette.onPrimary} /> : null}
                </View>
              </TouchableOpacity>

              {isOn && (
                <View style={styles.fields}>
                  {d.fields.map((f) => (
                    <View key={f.key} style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{f.label}</Text>
                      <TextInput
                        value={(profile[d.id] || {})[f.key] || ''}
                        onChangeText={(v) => setField(d.id, f.key, v)}
                        placeholder={f.placeholder}
                        placeholderTextColor={palette.textMuted}
                        style={styles.input}
                        keyboardType={f.numeric ? 'numeric' : 'default'}
                        testID={`cluster-field-${d.id}-${f.key}`}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.saveBar}>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]} testID="clusters-save">
          {saving ? <ActivityIndicator color={palette.onPrimary} /> : <>
            <Ionicons name="save-outline" size={18} color={palette.onPrimary} />
            <Text style={styles.saveText}>Сохранить специализации</Text>
          </>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: any) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    kicker: { color: c.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
    title: { color: c.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
    subtitle: { color: c.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 18 },
    card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, marginBottom: 12 },
    cardActive: { borderColor: c.primary },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    emoji: { fontSize: 28 },
    cardTitle: { color: c.text, fontSize: 16, fontWeight: '900' },
    cardDesc: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: c.primary, borderColor: c.primary },
    fields: { marginTop: 12, gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },
    fieldRow: { gap: 4 },
    fieldLabel: { color: c.text, fontSize: 12, fontWeight: '700' },
    input: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 14 },
    saveBar: { position: 'absolute', left: 20, right: 20, bottom: 24 },
    saveBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: c.primary, borderRadius: 16, paddingVertical: 16,
      ...Platform.select({
        ios: { shadowColor: c.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
        android: { elevation: 5 },
        default: {},
      }),
    },
    saveText: { color: c.onPrimary, fontSize: 16, fontWeight: '900' },
  });
}
