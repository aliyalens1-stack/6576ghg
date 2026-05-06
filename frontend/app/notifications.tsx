/**
 * Notifications screen — Sprint 34 D8 (real backend, not mock).
 *
 * Loads from GET /api/notifications. On click → marks read (POST /:id/read)
 * then routes to actionUrl (e.g. /chat/{threadId}, /booking/{id}).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import api from '../src/services/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  actionUrl?: string | null;
}

const ICON_MAP: Record<string, { name: any; tone: 'brand' | 'muted' | 'success' | 'warning' }> = {
  support_reply:    { name: 'chatbubble',     tone: 'brand'   },
  support_message:  { name: 'chatbubble',     tone: 'brand'   },
  provider_reply:   { name: 'chatbubbles',    tone: 'success' },
  booking_confirmed:{ name: 'checkmark-circle', tone: 'success' },
  payment_paid:     { name: 'card',           tone: 'success' },
  promo:            { name: 'gift',           tone: 'warning' },
  alert:            { name: 'flash',          tone: 'brand'   },
};

function getIcon(type: string) {
  return ICON_MAP[type] || { name: 'notifications', tone: 'muted' };
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  if (diff < 172_800_000) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen() {
  const { colors } = useThemeContext();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<{ notifications: Notification[]; unread: number }>('/api/notifications');
      setItems(res.data.notifications || []);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        setError('Войдите, чтобы видеть уведомления');
      } else {
        setError(e?.message || 'Не удалось загрузить уведомления');
      }
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handlePress = async (item: Notification) => {
    try {
      if (!item.isRead) {
        await api.post(`/api/notifications/${item.id}/read`).catch(() => {});
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      }
      if (item.actionUrl) {
        // Defensive route mapping for legacy / mock URLs
        const url = item.actionUrl
          .replace(/^\/bookings$/, '/(tabs)/quotes')
          .replace(/^\/fullmap$/, '/(tabs)');
        router.push(url as any);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleMarkAll = async () => {
    try {
      await api.post('/api/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  };

  const unread = items.filter((n) => !n.isRead).length;

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = getIcon(item.type);
    const tone =
      icon.tone === 'success' ? colors.success :
      icon.tone === 'warning' ? colors.warning :
      icon.tone === 'brand' ? colors.brand :
      colors.textSecondary;
    return (
      <TouchableOpacity
        testID={`notification-${item.id}`}
        style={[styles.card, { backgroundColor: item.isRead ? colors.card : (colors.brandSoft || colors.card) }]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, { backgroundColor: tone + '24' }]}>
          <Ionicons name={icon.name} size={22} color={tone} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.isRead && <View style={[styles.dot, { backgroundColor: colors.brand }]} />}
          </View>
          <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(item.createdAt)}</Text>
        </View>
        {item.actionUrl ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="notifications-screen">
      <SafeAreaView edges={['top']} style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="notifications-back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Уведомления</Text>
          {unread > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.brand }]}>
              <Text style={styles.unreadText}>{unread}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleMarkAll} style={styles.iconBtn} testID="notifications-mark-all" disabled={unread === 0}>
          <Ionicons name="checkmark-done" size={22} color={unread === 0 ? colors.textMuted : colors.brand} />
        </TouchableOpacity>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity onPress={fetchData} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
            <Text style={{ color: colors.brand, fontWeight: '700' }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Нет уведомлений</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Здесь появятся ответы поддержки и обновления заказов
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { padding: 4 },
  titleCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  unreadBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontWeight: '600', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  time: { fontSize: 11, marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
});
