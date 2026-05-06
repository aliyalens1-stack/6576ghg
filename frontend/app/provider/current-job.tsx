import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../src/context/ThemeContext';
import { currentJobAPI, liveAPI } from '../../src/services/api';
import { theme } from '../../src/context/ThemeContext';
const colors = theme.colors;

const { width } = Dimensions.get('window');

const STATUS_FLOW = [
  { key: 'confirmed', label: 'Подтверждён', action: 'start_route', actionLabel: 'Начать маршрут', icon: 'navigate', color: colors.brand },
  { key: 'on_route', label: 'В пути', action: 'arrive', actionLabel: 'Я на месте', icon: 'location', color: colors.warning },
  { key: 'arrived', label: 'На месте', action: 'start_work', actionLabel: 'Начать работу', icon: 'construct', color: colors.brand },
  { key: 'in_progress', label: 'В работе', action: 'complete', actionLabel: 'Завершить', icon: 'checkmark-circle', color: colors.success },
  { key: 'completed', label: 'Завершён', action: null, actionLabel: null, icon: 'trophy', color: colors.success },
];

function StatusTimeline({ currentStatus, colors }: { currentStatus: string; colors: any }) {
  const currentIdx = STATUS_FLOW.findIndex(s => s.key === currentStatus);
  return (
    <View style={styles.timeline}>
      {STATUS_FLOW.map((step, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        const dotColor = isDone ? colors.success : isActive ? step.color : colors.border;
        return (
          <View key={step.key} style={styles.timelineStep}>
            <View style={[styles.timelineDot, { backgroundColor: dotColor }]}>
              {isDone ? <Ionicons name="checkmark" size={10} color="#FFF" /> :
                isActive ? <Ionicons name={step.icon as any} size={10} color="#FFF" /> : null}
            </View>
            {i < STATUS_FLOW.length - 1 && (
              <View style={[styles.timelineLine, { backgroundColor: isDone ? colors.success : colors.border }]} />
            )}
            <Text style={[styles.timelineLabel, { color: isActive ? step.color : isDone ? colors.success : colors.textMuted }]} numberOfLines={1}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function CurrentJobScreen() {
  const { colors } = useThemeContext();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadJob = useCallback(async () => {
    try {
      const res = await currentJobAPI.getProviderCurrentJob();
      setJob(res.data);
    } catch (e: any) {
      if (e?.response?.status === 404) setJob(null);
      else console.log('Load job error:', e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadJob(); const iv = setInterval(loadJob, 10000); return () => clearInterval(iv); }, []);

  const handleAction = async (bookingId: string, action: string) => {
    setActionLoading(true);
    try {
      await currentJobAPI.providerAction(bookingId, action);
      await loadJob();
    } catch (e) { console.log('Action error:', e); }
    finally { setActionLoading(false); }
  };

  const currentStep = STATUS_FLOW.find(s => s.key === job?.status);
  const nextAction = currentStep?.action;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="current-job-screen">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="job-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Текущий заказ</Text>
        <TouchableOpacity onPress={loadJob} testID="job-refresh-btn">
          <Ionicons name="refresh" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {!job ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
            <Ionicons name="car-outline" size={48} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Нет активного заказа</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Примите заявку из входящих, чтобы начать работу
          </Text>
          <TouchableOpacity testID="go-to-inbox-btn" style={[styles.goInboxBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/provider/inbox')}>
            <Ionicons name="inbox" size={20} color="#FFF" />
            <Text style={styles.goInboxText}>Открыть входящие</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="go-to-chats-btn" style={[styles.goChatsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/provider/chats' as any)}>
            <Ionicons name="chatbubbles" size={20} color={colors.primary} />
            <Text style={[styles.goChatsText, { color: colors.text }]}>Чаты с клиентами</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Map placeholder */}
          <View style={[styles.mapPlaceholder, { backgroundColor: colors.card }]}>
            <Ionicons name="map" size={48} color={colors.primary} />
            <Text style={[styles.mapText, { color: colors.textSecondary }]}>
              {job.status === 'on_route' ? 'Маршрут к клиенту' :
               job.status === 'arrived' ? 'Вы на месте' :
               job.status === 'in_progress' ? 'Работа идёт' : 'Карта'}
            </Text>
            {job.eta && (
              <View style={[styles.etaBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="time" size={16} color="#FFF" />
                <Text style={styles.etaText}>ETA: {job.eta} мин</Text>
              </View>
            )}
          </View>

          <StatusTimeline currentStatus={job.status} colors={colors} />

          {/* Client Info */}
          <View style={[styles.clientCard, { backgroundColor: colors.card }]}>
            <View style={[styles.clientAvatar, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </View>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientName, { color: colors.text }]}>{job.customerName || 'Клиент'}</Text>
              <Text style={[styles.clientService, { color: colors.textSecondary }]}>{job.serviceName || 'Авто услуга'}</Text>
              {job.address && (
                <Text style={[styles.clientAddress, { color: colors.textMuted }]} numberOfLines={1}>
                  <Ionicons name="location-outline" size={12} /> {job.address}
                </Text>
              )}
            </View>
            <TouchableOpacity
              testID="chat-client-btn"
              style={[styles.callBtn, { backgroundColor: colors.primary + '15', marginRight: 8 }]}
              onPress={async () => {
                // Try to find or create thread for this booking
                try {
                  const api = (await import('../../src/services/api')).default;
                  const res = await api.get('/api/provider/chat/threads');
                  const threads = (res.data as any).threads || [];
                  const existing = threads.find((t: any) => t.bookingId === (job.bookingId || job.id));
                  if (existing) {
                    router.push(`/provider/chat/${existing.id}` as any);
                  } else {
                    router.push('/provider/chats' as any);
                  }
                } catch {
                  router.push('/provider/chats' as any);
                }
              }}
            >
              <Ionicons name="chatbubble" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity testID="call-client-btn" style={[styles.callBtn, { backgroundColor: colors.success + '15' }]}>
              <Ionicons name="call" size={22} color={colors.success} />
            </TouchableOpacity>
          </View>

          {/* Action Button */}
          {nextAction && (
            <TouchableOpacity
              testID={`action-${nextAction}`}
              style={[styles.mainActionBtn, { backgroundColor: currentStep?.color || colors.primary }]}
              onPress={() => handleAction(job.bookingId || job.id, nextAction)}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name={currentStep?.icon as any} size={24} color="#FFF" />
                  <Text style={styles.mainActionText}>{currentStep?.actionLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {job.status === 'completed' && (
            <View style={[styles.completedCard, { backgroundColor: colors.success + '15' }]}>
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
              <Text style={[styles.completedTitle, { color: colors.success }]}>Заказ завершён!</Text>
              {job.totalPrice && <Text style={[styles.completedPrice, { color: colors.text }]}>₴{job.totalPrice}</Text>}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12 },
  content: { flex: 1, padding: 16 },
  mapPlaceholder: { height: 180, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  mapText: { fontSize: 14, marginTop: 8 },
  etaBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6, marginTop: 8 },
  etaText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  timeline: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 },
  timelineStep: { alignItems: 'center', flex: 1 },
  timelineDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  timelineLine: { position: 'absolute', top: 12, left: '60%', right: '-60%', height: 2 },
  timelineLabel: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  clientCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 16 },
  clientAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  clientInfo: { flex: 1, marginLeft: 12 },
  clientName: { fontSize: 16, fontWeight: '600' },
  clientService: { fontSize: 13, marginTop: 2 },
  clientAddress: { fontSize: 12, marginTop: 2 },
  callBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  mainActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 10 },
  mainActionText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  goInboxBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, gap: 8, marginTop: 8 },
  goInboxText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  goChatsBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, gap: 8, marginTop: 8, borderWidth: StyleSheet.hairlineWidth },
  goChatsText: { fontSize: 14, fontWeight: '600' },
  completedCard: { alignItems: 'center', padding: 24, borderRadius: 16, marginTop: 16, gap: 8 },
  completedTitle: { fontSize: 18, fontWeight: '700' },
  completedPrice: { fontSize: 28, fontWeight: '800' },
});
