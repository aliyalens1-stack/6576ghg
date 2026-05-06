/**
 * Sprint 4 — Inspector Report Form (mobile).
 * Fetches /api/inspector/checklist for items, submits POST /api/inspector/jobs/{id}/report.
 * Credit consumption happens server-side ON SUBMIT (not before).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';

const API = (Constants.expoConfig as any)?.extra?.apiUrl
  || process.env.EXPO_PUBLIC_BACKEND_URL
  || 'http://localhost:8001';

type ItemStatus = 'ok' | 'warning' | 'problem' | 'not_checked';
type Verdict = 'recommended' | 'risky' | 'not_recommended';

interface ChecklistItem { key: string; group: string; }

const STATUS_OPTIONS: { value: ItemStatus; label: string; color: string }[] = [
  { value: 'ok', label: 'OK', color: '#22C55E' },
  { value: 'warning', label: '!', color: '#FFB020' },
  { value: 'problem', label: 'X', color: '#EF4444' },
];

const VERDICT_OPTIONS: { value: Verdict; label: string; color: string }[] = [
  { value: 'recommended', label: 'Recommended', color: '#22C55E' },
  { value: 'risky', label: 'Risky', color: '#FFB020' },
  { value: 'not_recommended', label: 'Don\'t buy', color: '#EF4444' },
];

const SCORE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PHOTO_MIN = 5;

interface LocalPhoto { uri: string; base64: string; mimeType: string; }

export default function InspectorReportForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [score, setScore] = useState<number>(7);
  const [summary, setSummary] = useState<string>('');
  const [issuesText, setIssuesText] = useState<string>('');
  const [repairMin, setRepairMin] = useState<string>('');
  const [repairMax, setRepairMax] = useState<string>('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [uploadingProgress, setUploadingProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const init = useCallback(async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      setToken(t);
      const res = await fetch(`${API}/api/inspector/checklist`);
      const data = await res.json();
      setItems(data.items || []);
      // default all to not_checked
      const initial: Record<string, ItemStatus> = {};
      (data.items || []).forEach((it: ChecklistItem) => { initial[it.key] = 'not_checked'; });
      setStatuses(initial);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { init(); }, [init]);

  const groupedItems = useMemo(() => {
    const g: Record<string, ChecklistItem[]> = {};
    items.forEach((it) => {
      if (!g[it.group]) g[it.group] = [];
      g[it.group].push(it);
    });
    return g;
  }, [items]);

  const checkedCount = useMemo(() => {
    return Object.values(statuses).filter((s) => s !== 'not_checked').length;
  }, [statuses]);

  const canSubmit = !submitting && verdict !== null && summary.trim().length >= 10 && checkedCount >= 5 && photos.length >= PHOTO_MIN;

  const pickPhotos = async () => {
    const remaining = PHOTO_MIN * 2 - photos.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', 'Up to 10 photos per report.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission denied', 'Photo library access is required to attach photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.7,
      selectionLimit: remaining,
    });
    if (result.canceled || !result.assets) return;
    const accepted: LocalPhoto[] = [];
    for (const a of result.assets) {
      if (!a.base64) continue;
      const mime = (a.mimeType || (a.uri.endsWith('.png') ? 'image/png' : 'image/jpeg')).toLowerCase();
      accepted.push({ uri: a.uri, base64: a.base64, mimeType: mime });
    }
    setPhotos((p) => [...p, ...accepted].slice(0, PHOTO_MIN * 2));
  };

  const removePhoto = (idx: number) => setPhotos((p) => p.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!canSubmit || !token || !id) return;
    setSubmitting(true);
    try {
      const checklist = items
        .filter((it) => statuses[it.key] !== 'not_checked')
        .map((it) => ({
          key: it.key,
          status: statuses[it.key],
          comment: (comments[it.key] || '').trim() || null,
        }));
      const issues = issuesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((title) => ({ severity: 'medium' as const, title, description: null }));

      const body: any = {
        score,
        verdict,
        checklist,
        issues,
        summary: summary.trim(),
      };
      const minNum = parseInt(repairMin, 10);
      const maxNum = parseInt(repairMax, 10);
      if (!isNaN(minNum)) body.repairEstimateMin = minNum;
      if (!isNaN(maxNum)) body.repairEstimateMax = maxNum;

      // 1. Submit the report (this consumes credit on the server)
      const res = await fetch(`${API}/api/inspector/jobs/${id}/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      const reportId = data?.report?.id;
      if (!reportId) throw new Error('Report submitted but server did not return id');

      // 2. Upload photos
      let uploaded = 0;
      const failures: string[] = [];
      for (const p of photos) {
        setUploadingProgress(`Uploading photo ${uploaded + 1} of ${photos.length}…`);
        const upRes = await fetch(`${API}/api/inspector/reports/${reportId}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'photo', mimeType: p.mimeType, dataBase64: p.base64 }),
        });
        if (upRes.ok) uploaded++;
        else {
          const txt = await upRes.text();
          failures.push(`#${uploaded + 1}: ${upRes.status} ${txt.slice(0, 80)}`);
        }
      }
      setUploadingProgress(null);

      const msg = failures.length === 0
        ? `Customer notified. Credit consumed. ${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded.`
        : `Report saved. ${uploaded}/${photos.length} photos uploaded. ${failures.length} failed.`;

      Alert.alert('Report submitted ✓', msg, [
        { text: 'OK', onPress: () => router.replace('/inspector/jobs') },
      ]);
    } catch (e: any) {
      setUploadingProgress(null);
      Alert.alert('Submit failed', e?.message || 'unknown');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 100 }} color="#FFB020" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="inspector-report-form">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="report-back">
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>/ INSPECTION REPORT /</Text>
          <Text style={styles.title}>Fill report</Text>

          {/* Score */}
          <Text style={styles.sectionLabel}>[ SCORE · {score}/10 ]</Text>
          <View style={styles.scoreRow}>
            {SCORE_STEPS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setScore(s)}
                style={[styles.scoreCell, score >= s && styles.scoreCellActive]}
                testID={`score-${s}`}
              >
                <Text style={[styles.scoreCellText, score >= s && styles.scoreCellTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Verdict */}
          <Text style={styles.sectionLabel}>[ VERDICT ]</Text>
          <View style={styles.verdictRow}>
            {VERDICT_OPTIONS.map((v) => (
              <TouchableOpacity
                key={v.value}
                onPress={() => setVerdict(v.value)}
                style={[styles.verdictBtn, verdict === v.value && { borderColor: v.color, backgroundColor: '#1a1a1a' }]}
                testID={`verdict-${v.value}`}
              >
                <Text style={[styles.verdictText, verdict === v.value && { color: v.color }]}>{v.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Checklist */}
          <Text style={styles.sectionLabel}>[ {t('inspector_checklist.title', { defaultValue: 'CHECKLIST' })} · {checkedCount}/{items.length} ]</Text>
          {Object.entries(groupedItems).map(([group, list]) => (
            <View key={group} style={styles.groupBox}>
              <Text style={styles.groupTitle}>
                {t(`inspector_checklist.groups.${group}`, { defaultValue: group.replace(/_/g, ' ').toUpperCase() })}
              </Text>
              {list.map((it) => (
                <View key={it.key} style={styles.checkRow}>
                  <Text style={styles.checkKey}>
                    {t(`inspector_checklist.items.${it.key}`, { defaultValue: it.key.replace(/_/g, ' ') })}
                  </Text>
                  <View style={styles.statusGroup}>
                    {STATUS_OPTIONS.map((opt) => {
                      const active = statuses[it.key] === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setStatuses({ ...statuses, [it.key]: active ? 'not_checked' : opt.value })}
                          style={[styles.statusBox, active && { backgroundColor: opt.color, borderColor: opt.color }]}
                          testID={`check-${it.key}-${opt.value}`}
                        >
                          <Text style={[styles.statusBoxText, active && { color: '#000' }]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ))}

          {/* Photos */}
          <Text style={styles.sectionLabel}>[ PHOTOS · {photos.length} / min {PHOTO_MIN} ]</Text>
          <View style={styles.photosGrid}>
            {photos.map((p, idx) => (
              <View key={idx} style={styles.photoCell}>
                <Image source={{ uri: p.uri }} style={styles.photoImg} />
                <TouchableOpacity
                  onPress={() => removePhoto(idx)}
                  style={styles.photoRemove}
                  testID={`photo-remove-${idx}`}
                >
                  <Ionicons name="close" size={14} color="#000" />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < PHOTO_MIN * 2 && (
              <TouchableOpacity
                style={styles.photoAddBtn}
                onPress={pickPhotos}
                testID="photo-add-btn"
              >
                <Ionicons name="add" size={28} color="#FFB020" />
                <Text style={styles.photoAddText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {photos.length < PHOTO_MIN && (
            <Text style={styles.photosHint}>
              Need at least {PHOTO_MIN - photos.length} more photo{PHOTO_MIN - photos.length === 1 ? '' : 's'} to submit.
            </Text>
          )}

          {/* Issues */}
          <Text style={styles.sectionLabel}>[ ISSUES (one per line) ]</Text>
          <TextInput
            style={[styles.input, { minHeight: 80 }]}
            multiline
            placeholder="Paint mismatch on rear left door&#10;Minor oil leak"
            placeholderTextColor="#5A5A5A"
            value={issuesText}
            onChangeText={setIssuesText}
            testID="issues-input"
          />

          {/* Repair estimate */}
          <Text style={styles.sectionLabel}>[ REPAIR ESTIMATE €  ·  optional ]</Text>
          <View style={styles.repairRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="number-pad"
              placeholder="min"
              placeholderTextColor="#5A5A5A"
              value={repairMin}
              onChangeText={setRepairMin}
              testID="repair-min"
            />
            <Text style={styles.dash}>—</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="number-pad"
              placeholder="max"
              placeholderTextColor="#5A5A5A"
              value={repairMax}
              onChangeText={setRepairMax}
              testID="repair-max"
            />
          </View>

          {/* Summary */}
          <Text style={styles.sectionLabel}>[ SUMMARY · ≥ 10 chars ]</Text>
          <TextInput
            style={[styles.input, { minHeight: 100 }]}
            multiline
            placeholder="Overall condition. Final advice for the buyer."
            placeholderTextColor="#5A5A5A"
            value={summary}
            onChangeText={setSummary}
            testID="summary-input"
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
            onPress={submit}
            disabled={!canSubmit}
            testID="report-submit"
          >
            {submitting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color="#000" />
                <Text style={styles.submitText}>{uploadingProgress || 'Submitting…'}</Text>
              </View>
            ) : (
              <>
                <Ionicons name="send" size={18} color="#000" />
                <Text style={styles.submitText}>Submit report</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Submitting consumes 1 customer credit. Make sure all key checks are filled.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#2E2E2E' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: 1, textTransform: 'uppercase' },
  body: { padding: 18, paddingBottom: 80 },
  kicker: { fontSize: 11, fontWeight: '800', color: '#FFB020', letterSpacing: 2 },
  title: { fontSize: 28, fontWeight: '900', color: '#FFF', marginTop: 6, letterSpacing: 0.5 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#FFB020', letterSpacing: 2, marginTop: 24, marginBottom: 10 },
  scoreRow: { flexDirection: 'row', gap: 4 },
  scoreCell: { flex: 1, height: 36, borderWidth: 1, borderColor: '#2E2E2E', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  scoreCellActive: { backgroundColor: '#FFB020', borderColor: '#FFB020' },
  scoreCellText: { fontSize: 12, fontWeight: '800', color: '#5A5A5A' },
  scoreCellTextActive: { color: '#000' },
  verdictRow: { flexDirection: 'row', gap: 8 },
  verdictBtn: { flex: 1, paddingVertical: 14, borderWidth: 1, borderColor: '#2E2E2E', borderRadius: 8, alignItems: 'center', backgroundColor: '#0d0d0d' },
  verdictText: { fontSize: 12, fontWeight: '800', color: '#A1A1AA', letterSpacing: 0.5, textTransform: 'uppercase' },
  groupBox: { marginBottom: 16, borderWidth: 1, borderColor: '#2E2E2E', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 12, backgroundColor: '#0d0d0d' },
  groupTitle: { fontSize: 11, fontWeight: '800', color: '#FFB020', letterSpacing: 1.5, marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  checkKey: { fontSize: 13, fontWeight: '600', color: '#FFF', flex: 1, textTransform: 'capitalize' },
  statusGroup: { flexDirection: 'row', gap: 6 },
  statusBox: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },
  statusBoxText: { fontSize: 13, fontWeight: '900', color: '#A1A1AA' },
  input: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2E2E2E', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 12, color: '#FFF', fontSize: 14, textAlignVertical: 'top' },
  repairRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dash: { color: '#A1A1AA', fontSize: 16, fontWeight: '700' },
  submitBtn: { marginTop: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFB020', paddingVertical: 18, borderRadius: 8 },
  submitText: { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 1, textTransform: 'uppercase' },
  disclaimer: { marginTop: 12, fontSize: 11, color: '#A1A1AA', textAlign: 'center', lineHeight: 16 },
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCell: { width: 80, height: 80, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFB020', alignItems: 'center', justifyContent: 'center' },
  photoAddBtn: { width: 80, height: 80, borderRadius: 6, borderWidth: 2, borderColor: '#FFB020', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  photoAddText: { fontSize: 10, fontWeight: '700', color: '#FFB020', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  photosHint: { marginTop: 8, fontSize: 11, color: '#FFB020', fontWeight: '600' },
});
