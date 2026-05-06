/**
 * P0 — Inspector Job Detail (full execution flow).
 * Lifecycle: open → claimed → on_route → arrived → inspecting → done
 *
 * Includes:
 *   • Action buttons (state-machine)
 *   • Timeline visualization
 *   • Media upload section with categories (photo/video)
 *   • Path to checklist + report submission
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';

const API = (Constants.expoConfig as any)?.extra?.apiUrl
  || process.env.EXPO_PUBLIC_BACKEND_URL
  || 'http://localhost:8001';

interface Job {
  id: string; requestId: string; city: string; status: string;
  brand: string; model: string; budget: number;
  inspectorId?: string | null;
  reportId?: string | null;
  claimedAt?: string | null;
  onRouteAt?: string | null;
  arrivedAt?: string | null;
  inspectionStartedAt?: string | null;
  completedAt?: string | null;
}

interface JobMediaStats {
  total: number;
  photos: number;
  videos: number;
  byCategory: Record<string, number>;
}

const TIMELINE: { key: string; label: string; tsField: keyof Job }[] = [
  { key: 'claimed', label: 'Принято', tsField: 'claimedAt' },
  { key: 'on_route', label: 'В пути', tsField: 'onRouteAt' },
  { key: 'arrived', label: 'На месте', tsField: 'arrivedAt' },
  { key: 'inspecting', label: 'Проверка идёт', tsField: 'inspectionStartedAt' },
  { key: 'done', label: 'Отчёт отправлен', tsField: 'completedAt' },
];

// Media categories (must match backend CATEGORIES set)
const MEDIA_CATEGORIES: { key: string; label: string; icon: any }[] = [
  { key: 'exterior',   label: 'Кузов',    icon: 'car-sport-outline' },
  { key: 'interior',   label: 'Салон',    icon: 'cube-outline' },
  { key: 'engine',     label: 'Двигатель', icon: 'cog-outline' },
  { key: 'documents',  label: 'Документы', icon: 'document-text-outline' },
  { key: 'damage',     label: 'Повреждения', icon: 'warning-outline' },
  { key: 'odometer',   label: 'Пробег',    icon: 'speedometer-outline' },
  { key: 'vin',        label: 'VIN',       icon: 'finger-print-outline' },
  { key: 'test_drive', label: 'Тест-драйв', icon: 'navigate-outline' },
  { key: 'other',      label: 'Другое',    icon: 'ellipsis-horizontal' },
];

export default function InspectorJobDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [mediaStats, setMediaStats] = useState<JobMediaStats>({ total: 0, photos: 0, videos: 0, byCategory: {} });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);

  const load = useCallback(async (t: string | null) => {
    if (!t || !id) return;
    try {
      const [jobRes, mediaRes] = await Promise.allSettled([
        fetch(`${API}/api/inspector/jobs/${id}`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
        fetch(`${API}/api/inspector/jobs/${id}/media`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
      ]);
      if (jobRes.status === 'fulfilled' && jobRes.value?.job) setJob(jobRes.value.job);
      if (mediaRes.status === 'fulfilled' && mediaRes.value?.stats) setMediaStats(mediaRes.value.stats);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('token');
      setToken(t);
      if (!t) {
        Alert.alert('Sign in required', '', [{ text: 'OK', onPress: () => router.replace('/login?role=provider') }]);
        return;
      }
      await load(t);
    })();
  }, [load, router]);

  const action = async (path: string, confirmMsg?: string) => {
    if (!job || !token) return;
    if (confirmMsg) {
      const go = await new Promise<boolean>((resolve) => {
        Alert.alert('Подтверждение', confirmMsg, [
          { text: 'Отмена', onPress: () => resolve(false) },
          { text: 'Да', onPress: () => resolve(true), style: 'destructive' },
        ]);
      });
      if (!go) return;
    }
    setActing(true);
    try {
      const res = await fetch(`${API}/api/inspector/jobs/${job.id}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: path === 'cancel' ? JSON.stringify({ reason: 'inspector cancel' }) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      if (path === 'cancel') {
        Alert.alert('Отменено', 'Задание возвращено в общий пул.', [
          { text: 'OK', onPress: () => router.replace('/inspector/jobs') },
        ]);
      } else {
        setJob(data.job || job);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось');
    } finally {
      setActing(false);
    }
  };

  const uploadMedia = async (category: string, mediaType: 'photo' | 'video') => {
    if (!job || !token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Доступ запрещён', 'Нужен доступ к галерее.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaType === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      base64: mediaType === 'photo',
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploadingCat(category);
    try {
      let dataBase64 = asset.base64 || '';
      let mimeType = (asset.mimeType || '').toLowerCase();

      if (mediaType === 'video') {
        // Read video as base64
        const r = await fetch(asset.uri);
        const blob = await r.blob();
        const reader = new FileReader();
        dataBase64 = await new Promise<string>((res, rej) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            res(result.split(',')[1] || '');
          };
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        if (!mimeType) mimeType = 'video/mp4';
      } else {
        if (!mimeType) mimeType = asset.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
      }

      const res = await fetch(`${API}/api/inspector/jobs/${job.id}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: mediaType, mimeType, dataBase64, category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      // Refresh stats
      await load(token);
    } catch (e: any) {
      Alert.alert('Ошибка загрузки', e?.message || 'Не удалось загрузить');
    } finally {
      setUploadingCat(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 100 }} color="#FFB020" />
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.errorText}>Задание не найдено</Text>
      </SafeAreaView>
    );
  }

  const status = job.status;
  const canUploadMedia = ['claimed', 'on_route', 'arrived', 'inspecting'].includes(status);

  return (
    <SafeAreaView style={styles.safe} testID="inspector-job-detail">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/inspector/jobs')} testID="job-detail-back">
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Задание</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.kicker}>/ ИНСПЕКЦИЯ /</Text>
        <Text style={styles.title}>{job.brand} {job.model}</Text>

        <View style={styles.specRow}>
          <View style={styles.specItem}>
            <Ionicons name="location-outline" size={14} color="#A1A1AA" />
            <Text style={styles.specText}>{job.city}</Text>
          </View>
          <View style={styles.specItem}>
            <Ionicons name="cash-outline" size={14} color="#A1A1AA" />
            <Text style={styles.specText}>до {Number(job.budget).toLocaleString('de-DE')} €</Text>
          </View>
        </View>

        {/* Timeline */}
        <Text style={styles.sectionLabel}>[ ХОД РАБОТЫ ]</Text>
        <View style={styles.timelineBox}>
          {TIMELINE.map((step, idx) => {
            const ts = (job as any)[step.tsField];
            const isDone = !!ts || (step.key === 'claimed' && status !== 'open');
            const isCurrent = status === step.key && !ts;
            const dotColor = isDone ? '#22C55E' : isCurrent ? '#FFB020' : '#2E2E2E';
            return (
              <View key={step.key} style={styles.timelineRow}>
                <View style={styles.timelineCol}>
                  <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
                  {idx < TIMELINE.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 14 }}>
                  <Text style={[styles.stepLabel, !isDone && !isCurrent && styles.stepLabelInactive]}>
                    {step.label}
                  </Text>
                  {ts && <Text style={styles.stepTs}>{new Date(ts).toLocaleString('de-DE')}</Text>}
                </View>
              </View>
            );
          })}
        </View>

        {/* Action buttons */}
        <Text style={styles.sectionLabel}>[ ДЕЙСТВИЕ ]</Text>
        <View style={styles.actionBox}>
          {status === 'claimed' && (
            <ActionBtn label="🚗 Выехал" icon="navigate" onPress={() => action('on-route')} disabled={acting} testID="job-action-on-route" />
          )}
          {status === 'on_route' && (
            <ActionBtn label="📍 На месте" icon="checkmark-circle" onPress={() => action('arrived')} disabled={acting} testID="job-action-arrived" />
          )}
          {status === 'arrived' && (
            <ActionBtn label="🔧 Начать проверку" icon="construct" onPress={() => action('start-inspection')} disabled={acting} testID="job-action-start-inspection" />
          )}
          {status === 'inspecting' && (
            <ActionBtn
              label="📋 Заполнить отчёт"
              icon="document-text"
              onPress={() => router.push({ pathname: '/inspector/job/[id]/report', params: { id: job.id } })}
              disabled={acting}
              testID="job-action-fill-report"
            />
          )}
          {status === 'done' && (
            <View style={styles.doneBox}>
              <Ionicons name="checkmark-done-circle" size={28} color="#22C55E" />
              <Text style={styles.doneText}>Отчёт отправлен</Text>
              {job.reportId && <Text style={styles.doneSub}>id: {job.reportId.substring(0, 8)}…</Text>}
            </View>
          )}

          {(status === 'claimed' || status === 'on_route' || status === 'arrived' || status === 'inspecting') && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => action('cancel', 'Отменить задание? Оно вернётся в общий пул.')}
              disabled={acting}
              testID="job-action-cancel"
            >
              <Text style={styles.cancelText}>Отменить задание</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Media uploads (P0) — by category */}
        {canUploadMedia && (
          <>
            <Text style={styles.sectionLabel}>
              [ ФОТО / ВИДЕО · {mediaStats.total} файл(ов) ]
            </Text>
            <Text style={styles.mediaHint}>
              📸 {mediaStats.photos} фото · 🎥 {mediaStats.videos} видео — снимайте по категориям, потом всё это пойдёт в отчёт.
            </Text>
            <View style={styles.mediaGrid}>
              {MEDIA_CATEGORIES.map((cat) => {
                const count = mediaStats.byCategory?.[cat.key] || 0;
                const isUploading = uploadingCat === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    testID={`media-cat-${cat.key}`}
                    style={[styles.mediaCell, count > 0 && styles.mediaCellHasItems]}
                    onPress={() => {
                      Alert.alert(cat.label, 'Что добавить?', [
                        { text: 'Отмена', style: 'cancel' },
                        { text: '📸 Фото', onPress: () => uploadMedia(cat.key, 'photo') },
                        { text: '🎥 Видео', onPress: () => uploadMedia(cat.key, 'video') },
                      ]);
                    }}
                    disabled={isUploading || acting}
                    activeOpacity={0.8}
                  >
                    {isUploading ? (
                      <ActivityIndicator color="#FFB020" />
                    ) : (
                      <>
                        <Ionicons name={cat.icon} size={22} color={count > 0 ? '#FFB020' : '#A1A1AA'} />
                        <Text style={[styles.mediaLabel, count > 0 && { color: '#FFB020' }]}>{cat.label}</Text>
                        <Text style={styles.mediaCount}>{count > 0 ? `× ${count}` : '+'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionBtn({ label, icon, onPress, disabled, testID }: any) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      <Ionicons name={icon} size={18} color="#000" />
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#2E2E2E' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: 1, textTransform: 'uppercase' },
  body: { padding: 18, paddingBottom: 80 },
  kicker: { fontSize: 11, fontWeight: '800', color: '#FFB020', letterSpacing: 2 },
  title: { fontSize: 32, fontWeight: '900', color: '#FFF', marginTop: 6, letterSpacing: 0.5 },
  specRow: { flexDirection: 'row', gap: 16, marginTop: 12, marginBottom: 24 },
  specItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  specText: { fontSize: 13, color: '#A1A1AA', fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#FFB020', letterSpacing: 2, marginBottom: 12, marginTop: 18 },
  timelineBox: { borderWidth: 1, borderColor: '#2E2E2E', borderRadius: 12, padding: 16, backgroundColor: '#0d0d0d' },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineCol: { width: 16, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#2E2E2E', marginTop: 2 },
  stepLabel: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  stepLabelInactive: { color: '#5A5A5A' },
  stepTs: { fontSize: 11, color: '#A1A1AA', marginTop: 2 },
  actionBox: { gap: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFB020', paddingVertical: 16, borderRadius: 8 },
  primaryBtnText: { fontSize: 15, fontWeight: '900', color: '#000', letterSpacing: 0.5, textTransform: 'uppercase' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2E2E2E', borderRadius: 8 },
  cancelText: { fontSize: 13, color: '#A1A1AA', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  doneBox: { alignItems: 'center', padding: 24, borderWidth: 1, borderColor: '#22C55E', borderRadius: 12, backgroundColor: '#0d0d0d' },
  doneText: { fontSize: 16, fontWeight: '900', color: '#22C55E', marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 },
  doneSub: { fontSize: 11, color: '#A1A1AA', marginTop: 4 },
  errorText: { marginTop: 60, textAlign: 'center', color: '#EF4444', fontWeight: '700' },
  // Media
  mediaHint: { fontSize: 12, color: '#A1A1AA', marginBottom: 12, lineHeight: 17 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mediaCell: {
    width: '31%', aspectRatio: 1.05, borderWidth: 1, borderColor: '#2E2E2E', borderRadius: 12,
    backgroundColor: '#0d0d0d', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 4,
  },
  mediaCellHasItems: { borderColor: '#FFB020', backgroundColor: '#1a1408' },
  mediaLabel: { fontSize: 11, fontWeight: '700', color: '#A1A1AA', textAlign: 'center' },
  mediaCount: { fontSize: 10, fontWeight: '900', color: '#FFB020' },
});
