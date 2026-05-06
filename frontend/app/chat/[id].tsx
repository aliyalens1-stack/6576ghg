/**
 * Chat thread screen — Sprint 34 D8 (real backend chat).
 *
 * GET /api/chat/threads/{id}/messages — load messages
 * POST /api/chat/threads/{id}/messages — send
 * POST /api/chat/threads/{id}/read — mark read on open
 *
 * Polls every 4s for new messages (lightweight; can be upgraded to WS later).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../src/context/ThemeContext';
import api from '../../src/services/api';

interface Message {
  id: string;
  threadId: string;
  senderType: 'user' | 'provider' | 'admin';
  senderId: string;
  text: string;
  createdAt: string;
  readAt?: string | null;
}

interface Thread {
  id: string;
  type: 'support' | 'provider' | 'admin_user';
  title: string;
  providerSlug?: string | null;
  bookingId?: string | null;
}

const POLL_MS = 4000;

function fmtTime(ts: string) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useThemeContext();

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<any>(null);

  const fetchMessages = useCallback(
    async (initial = false) => {
      if (!id) return;
      try {
        const res = await api.get<{ thread: Thread; messages: Message[] }>(
          `/api/chat/threads/${id}/messages`
        );
        setThread(res.data.thread);
        setMessages(res.data.messages || []);
        setError(null);
        if (initial) {
          // mark thread as read
          api.post(`/api/chat/threads/${id}/read`).catch(() => {});
        }
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 404) setError('Чат не найден');
        else if (status === 403) setError('Нет доступа к этому чату');
        else if (status === 401) setError('Войдите, чтобы открыть чат');
        else setError(e?.message || 'Ошибка загрузки');
      } finally {
        if (initial) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchMessages(true);
    pollRef.current = setInterval(() => fetchMessages(false), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    // Auto-scroll to bottom on new message
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const res = await api.post<{ message: Message }>(`/api/chat/threads/${id}/messages`, { text: t });
      setMessages((prev) => [...prev, res.data.message]);
      setText('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const mine = item.senderType === 'user';
    const showHeader =
      index === 0 ||
      messages[index - 1].senderType !== item.senderType ||
      new Date(item.createdAt).getTime() - new Date(messages[index - 1].createdAt).getTime() > 60000;

    return (
      <View style={{ paddingVertical: 4 }}>
        {showHeader && !mine && (
          <Text style={[styles.senderLabel, { color: colors.textMuted }]}>
            {item.senderType === 'admin' ? '🛡 Поддержка AutoSearch' : '👨‍🔧 Мастер'}
          </Text>
        )}
        <View
          style={[
            styles.bubble,
            mine
              ? [styles.bubbleMine, { backgroundColor: colors.brand }]
              : [styles.bubbleOther, { backgroundColor: colors.card }],
          ]}
        >
          <Text style={[styles.msgText, { color: mine ? '#000' : colors.text }]} selectable>
            {item.text}
          </Text>
          <Text
            style={[
              styles.msgTime,
              { color: mine ? 'rgba(0,0,0,0.55)' : colors.textMuted },
            ]}
          >
            {fmtTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="chat-screen">
      <SafeAreaView edges={['top']} style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="chat-back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {thread?.title || (loading ? 'Загрузка...' : 'Чат')}
          </Text>
          {thread?.type === 'support' && (
            <Text style={[styles.subtitle, { color: colors.success || colors.brand }]}>
              · официальная поддержка
            </Text>
          )}
        </View>
        <View style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : error && messages.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity onPress={() => router.back()} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
              <Text style={{ color: colors.brand, fontWeight: '700' }}>Назад</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(it) => it.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Напишите первое сообщение
                </Text>
              </View>
            }
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Сообщение..."
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
            multiline
            maxLength={4000}
            testID="chat-input"
          />
          <TouchableOpacity
            testID="chat-send-btn"
            onPress={send}
            disabled={!text.trim() || sending}
            style={[
              styles.sendBtn,
              { backgroundColor: text.trim() && !sending ? colors.brand : colors.border },
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Ionicons name="send" size={20} color={text.trim() ? '#000' : colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  iconBtn: { padding: 6, minWidth: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 11, fontWeight: '600' },
  list: { padding: 12, gap: 0, paddingBottom: 16 },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  msgText: { fontSize: 15, lineHeight: 20 },
  msgTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  senderLabel: { fontSize: 11, marginLeft: 6, marginTop: 4, marginBottom: 2 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, fontSize: 15,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
});
