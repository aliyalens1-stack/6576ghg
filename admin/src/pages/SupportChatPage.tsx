/**
 * Support Chat Admin page — Sprint 34 D8
 *
 * Master Admin can:
 *  - See all customer support threads (left pane)
 *  - Open thread → see full message history (right pane)
 *  - Reply as "support" → user gets notification + new message in chat/[id]
 *
 * Polls every 5s for new messages in active thread.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Send, RefreshCw, Search, Shield, User as UserIcon, MessageCircle } from 'lucide-react';
import api from '../services/api';

interface Thread {
  id: string;
  type: string;
  title: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadByOther: boolean;
  participantUserId: string;
  user?: { email: string; firstName?: string; lastName?: string };
}

interface Message {
  id: string;
  threadId: string;
  senderType: 'user' | 'admin' | 'provider';
  text: string;
  createdAt: string;
}

const POLL_MS = 5000;

function fmtTime(ts: string) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86_400_000) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff < 172_800_000) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function SupportChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<any>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = async () => {
    try {
      setError(null);
      const res = await api.get<{ threads: Thread[] }>('/admin/chat/threads?type=support');
      setThreads(res.data.threads || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load threads');
    } finally {
      setLoadingThreads(false);
    }
  };

  const fetchMessages = async (tid: string) => {
    try {
      const res = await api.get<{ messages: Message[] }>(`/admin/chat/threads/${tid}/messages`);
      setMessages(res.data.messages || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    const i = setInterval(fetchThreads, 10000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setLoadingMessages(true);
    fetchMessages(activeId);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchMessages(activeId), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeId]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const t = reply.trim();
    if (!t || !activeId || sending) return;
    setSending(true);
    try {
      const res = await api.post<{ message: Message }>(`/admin/chat/threads/${activeId}/reply`, { text: t });
      setMessages((prev) => [...prev, res.data.message]);
      setReply('');
      // refresh thread list to update preview
      fetchThreads();
    } catch (e: any) {
      setError(e?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const filtered = useMemo(
    () =>
      threads.filter((t) => {
        const q = search.toLowerCase();
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          (t.user?.email || '').toLowerCase().includes(q) ||
          t.lastMessage.toLowerCase().includes(q)
        );
      }),
    [threads, search]
  );

  const activeThread = threads.find((t) => t.id === activeId);

  return (
    <div className="p-6 space-y-4 h-full flex flex-col" data-testid="support-chat-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-emerald-600/20 to-teal-600/20 rounded-xl border border-emerald-500/30">
            <Headphones size={28} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Support Chat</h1>
            <p className="text-slate-400 text-sm">
              {threads.length} threads · {threads.filter((t) => t.unreadByOther).length} unread
            </p>
          </div>
        </div>
        <button
          onClick={fetchThreads}
          className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
          data-testid="support-chat-refresh"
        >
          <RefreshCw size={18} className={loadingThreads ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 text-red-300 text-sm">{error}</div>
      )}

      <div className="flex flex-1 gap-4 min-h-0">
        {/* THREADS LIST */}
        <div className="w-80 bg-slate-800 rounded-xl border border-slate-700 flex flex-col">
          <div className="p-3 border-b border-slate-700">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по email / тексту"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                data-testid="support-chat-search"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="p-6 text-center text-slate-500 text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                <MessageCircle size={32} />
                <span>Нет support чатов</span>
              </div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`w-full text-left p-3 border-b border-slate-700/50 transition ${
                    activeId === t.id ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500' : 'hover:bg-slate-700/30'
                  }`}
                  data-testid={`support-thread-${t.id}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <UserIcon size={16} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white truncate">
                          {t.user?.email || t.participantUserId.slice(0, 16)}
                        </span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0">{fmtTime(t.lastMessageAt)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-slate-400 truncate flex-1">{t.lastMessage || '—'}</span>
                        {t.unreadByOther && (
                          <span className="ml-2 w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* CHAT VIEW */}
        <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 flex flex-col">
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <MessageCircle size={48} className="mx-auto mb-3 opacity-40" />
                <p>Выберите чат слева</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-emerald-400" />
                  <div className="flex-1">
                    <div className="text-white font-semibold">
                      {activeThread?.user?.email || activeThread?.participantUserId.slice(0, 16)}
                    </div>
                    <div className="text-xs text-slate-400">support · ID {activeId.slice(0, 8)}</div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="text-center text-slate-500 text-sm">Loading...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm">Нет сообщений</div>
                ) : (
                  messages.map((m) => {
                    const isAdmin = m.senderType === 'admin';
                    return (
                      <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                            isAdmin
                              ? 'bg-emerald-500 text-black rounded-br-md'
                              : 'bg-slate-700 text-white rounded-bl-md'
                          }`}
                        >
                          {!isAdmin && (
                            <div className="text-[10px] font-semibold text-slate-400 mb-1">User</div>
                          )}
                          <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                          <div className={`text-[10px] mt-1 ${isAdmin ? 'text-black/60' : 'text-slate-400'}`}>
                            {fmtTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={msgEndRef} />
              </div>

              <div className="p-3 border-t border-slate-700 flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ответить пользователю... (Enter — отправить, Shift+Enter — новая строка)"
                  rows={2}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 resize-none"
                  data-testid="support-reply-input"
                />
                <button
                  onClick={handleSend}
                  disabled={!reply.trim() || sending}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-lg font-bold flex items-center gap-2 transition"
                  data-testid="support-reply-send"
                >
                  {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
