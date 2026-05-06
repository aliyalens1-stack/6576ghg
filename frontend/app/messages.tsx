/**
 * Messages screen — Sprint 34 D8 (real backend, not mock).
 *
 * Lists user's chat threads from GET /api/chat/threads.
 * "Связаться с поддержкой" CTA → POST /api/chat/threads {type:'support'} → /chat/{id}
 * Each thread tap → /chat/{thread.id}
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import api from '../src/services/api';

interface Thread {
  id: string;
  type: 'support' | 'provider' | 'admin_user';
  title: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadByUser: boolean;
  providerSlug?: string | null;
  provider?: { name?: string; avatar?: string };
}

function formatTime(timestamp: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86_400_000) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 172_800_000) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function MessagesScreen() {
  const { colors } = useThemeContext();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [creatingSupport, setCreatingSupport] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<{ threads: Thread[] }>('/api/chat/threads');
      setThreads(res.data.threads || []);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) setError('Войдите, чтобы видеть сообщения');
      else setError(e?.message || 'Не удалось загрузить чаты');
      setThreads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const handleContactSupport = async () => {
    if (creatingSupport) return;
    setCreatingSupport(true);
    try {
      const res = await api.post<{ thread: Thread }>('/api/chat/threads', { type: 'support' });
      const tid = res.data.thread.id;
      router.push(`/chat/${tid}` as any);
    } catch (e: any) {
      setError('Не удалось открыть чат поддержки');
    } finally {
      setCreatingSupport(false);
    }
  };

  const filtered = threads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalUnread = threads.filter((t) => t.unreadByUser).length;

  const renderThread = ({ item }: { item: Thread }) => {
    const isSupport = item.type === 'support';
    const initial = (item.title || '?').charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        testID={`thread-${item.id}`}
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push(`/chat/${item.id}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: isSupport ? colors.brand : (colors.brandSoft || colors.primary) }]}>
            <Text style={[styles.avatarText, { color: isSupport ? '#000' : colors.brand }]}>{initial}</Text>
          </View>
          {isSupport && (
            <View style={[styles.supportBadge, { backgroundColor: colors.success || colors.brand }]}>
              <Ionicons name="shield-checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.bodyRow}>
            <Text style={[styles.lastMsg, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.lastMessage || 'Начните диалог...'}
            </Text>
            {item.unreadByUser && <View style={[styles.unreadDot, { backgroundColor: colors.brand }]} />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="messages-screen">
      <SafeAreaView edges={['top']} style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="messages-back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Сообщения</Text>
          {totalUnread > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.brand }]}>
              <Text style={styles.unreadText}>{totalUnread}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleContactSupport} style={styles.iconBtn} testID="messages-new-support" disabled={creatingSupport}>
          {creatingSupport ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="create-outline" size={22} color={colors.brand} />}
        </TouchableOpacity>
      </SafeAreaView>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card }]}>
        <View style={[styles.searchInput, { backgroundColor: colors.backgroundTertiary || colors.background }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchText, { color: colors.text }]}
            placeholder="Поиск"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
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
          data={filtered}
          renderItem={renderThread}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Нет сообщений</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Начните диалог с поддержкой или с мастером после записи
              </Text>
              <TouchableOpacity
                testID="empty-contact-support"
                style={[styles.supportBtn, { backgroundColor: colors.brand }]}
                onPress={handleContactSupport}
                disabled={creatingSupport}
              >
                <Ionicons name="shield-checkmark" size={18} color="#000" />
                <Text style={styles.supportBtnText}>Связаться с поддержкой</Text>
              </TouchableOpacity>
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
  iconBtn: { padding: 4, minWidth: 32 },
  titleCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  unreadBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, gap: 8,
  },
  searchText: { flex: 1, fontSize: 15 },
  list: { padding: 16, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800' },
  supportBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0a0a0a',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  time: { fontSize: 12 },
  bodyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  lastMsg: { flex: 1, fontSize: 14 },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', maxWidth: 300 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
  supportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 12,
  },
  supportBtnText: { fontSize: 15, fontWeight: '900', color: '#000' },
});
