/**
 * Sprint 4 — Inspector Jobs Board (mobile).
 * Tabs: Available · My (active) · Done
 * GET  /api/inspector/jobs       (open)
 * GET  /api/inspector/jobs/my    (mine, full lifecycle)
 * POST /api/inspector/jobs/:id/claim
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API = (Constants.expoConfig as any)?.extra?.apiUrl
  || process.env.EXPO_PUBLIC_BACKEND_URL
  || 'http://localhost:8001';

interface Job {
  id: string; requestId: string; city: string; status: string;
  brand: string; model: string; budget: number; createdAt: string;
  inspectorId?: string | null;
  reportId?: string | null;
  onRouteAt?: string | null;
  arrivedAt?: string | null;
  inspectionStartedAt?: string | null;
  completedAt?: string | null;
}

type Tab = 'available' | 'my' | 'done';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  claimed: 'Claimed',
  on_route: 'On route',
  arrived: 'Arrived',
  inspecting: 'Inspecting',
  done: 'Done',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#A1A1AA',
  claimed: '#3B82F6',
  on_route: '#FFB020',
  arrived: '#FFB020',
  inspecting: '#FFB020',
  done: '#22C55E',
};

export default function InspectorJobsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('my');
  const [available, setAvailable] = useState<Job[]>([]);
  const [mine, setMine] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (currentToken: string | null) => {
    setError(null);
    try {
      const promises: Promise<any>[] = [
        fetch(`${API}/api/inspector/jobs`).then((r) => r.json()),
      ];
      if (currentToken) {
        promises.push(
          fetch(`${API}/api/inspector/jobs/my`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }).then((r) => r.json()),
        );
      }
      const [openData, myData] = await Promise.all(promises);
      setAvailable(openData?.jobs || []);
      setMine(myData?.jobs || []);
    } catch (e: any) {
      setError(e?.message || 'failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('token');
      setToken(t);
      await load(t);
    })();
  }, [load]);

  const onRefresh = () => { setRefreshing(true); load(token); };

  const claim = async (job: Job) => {
    if (!token) {
      Alert.alert('Sign in required', 'To claim a job you need to be signed in as a provider/inspector.', [
        { text: 'Cancel' }, { text: 'Sign in', onPress: () => router.push('/login?role=provider') },
      ]);
      return;
    }
    try {
      const res = await fetch(`${API}/api/inspector/jobs/${job.id}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 409) { Alert.alert('Already claimed', 'This job was just taken.'); load(token); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push({ pathname: '/inspector/job/[id]', params: { id: job.id } });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'failed');
    }
  };

  const myActive = mine.filter((j) => j.status !== 'done' && j.status !== 'open');
  const myDone = mine.filter((j) => j.status === 'done');
  const visible = tab === 'available' ? available : tab === 'my' ? myActive : myDone;

  return (
    <SafeAreaView style={styles.safe} testID="inspector-jobs-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="jobs-back-btn">
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inspector</Text>
        <TouchableOpacity onPress={onRefresh} testID="jobs-refresh-btn">
          <Ionicons name="refresh" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {(['available', 'my', 'done'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => {
              if (t === 'available') {
                // Phase 3 — Step 3: "Available" → exposures feed (curated by platform).
                // Old fan-out open-jobs remain readable via API for backwards-compat
                // but the entry point for inspectors is the exposure stream.
                router.push('/inspector/exposures' as any);
                return;
              }
              setTab(t);
            }}
            style={[styles.tabPill, tab === t && styles.tabPillActive]}
            testID={`jobs-tab-${t}`}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'available' ? 'Доступные'
                : t === 'my' ? `Мои · ${myActive.length}`
                : `История · ${myDone.length}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color="#FFB020" />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFB020" />}
      >
        {!loading && visible.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="search" size={28} color="#A1A1AA" />
            <Text style={styles.emptyTitle}>
              {tab === 'available' ? 'No open jobs right now' : tab === 'my' ? 'No active jobs' : 'No completed jobs'}
            </Text>
            <Text style={styles.emptySub}>Pull to refresh.</Text>
          </View>
        )}

        {visible.map((j) => {
          const onPress = () => {
            if (tab === 'available') {
              claim(j);
            } else {
              router.push({ pathname: '/inspector/job/[id]', params: { id: j.id } });
            }
          };
          const statusColor = STATUS_COLORS[j.status] || '#A1A1AA';
          return (
            <TouchableOpacity
              key={j.id}
              style={styles.card}
              testID={`inspector-job-${j.id}`}
              onPress={onPress}
              activeOpacity={0.7}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}><Ionicons name="car-sport" size={18} color="#FFB020" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{j.brand} {j.model}</Text>
                  <Text style={styles.cardSub}>
                    <Ionicons name="location-outline" size={12} color="#A1A1AA" /> {j.city} · до {Number(j.budget).toLocaleString('de-DE')} €
                  </Text>
                </View>
                <View style={[styles.statusPill, { borderColor: statusColor }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[j.status] || j.status}</Text>
                </View>
              </View>
              <View style={styles.cardActionRow}>
                <Text style={styles.cardActionText}>
                  {tab === 'available' ? 'Tap to claim →' : 'Tap to open →'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#2E2E2E' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: 1, textTransform: 'uppercase' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2E2E2E' },
  tabPill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#2E2E2E' },
  tabPillActive: { backgroundColor: '#FFB020', borderColor: '#FFB020' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
  tabTextActive: { color: '#000' },
  body: { padding: 18, paddingBottom: 60 },
  emptyBox: { alignItems: 'center', padding: 40, borderWidth: 1, borderColor: '#2E2E2E', borderRadius: 12, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#FFF', marginTop: 10 },
  emptySub: { fontSize: 13, color: '#A1A1AA', marginTop: 3, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: '#2E2E2E', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 14, marginBottom: 10, backgroundColor: '#0d0d0d' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  cardIcon: { height: 38, width: 38, borderRadius: 10, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2E2E2E' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  cardSub: { fontSize: 12, color: '#A1A1AA', marginTop: 2 },
  statusPill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  cardActionRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2E2E2E', alignItems: 'flex-end' },
  cardActionText: { fontSize: 11, fontWeight: '700', color: '#FFB020', letterSpacing: 0.5, textTransform: 'uppercase' },
  errorText: { marginTop: 40, textAlign: 'center', color: '#EF4444', fontWeight: '700' },
});
