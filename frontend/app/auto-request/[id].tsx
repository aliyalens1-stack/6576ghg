// Phase 2 — Request Detail (customer view).
// Shows status / type / country / city / links / inspection jobs / reports.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../../src/context/ThemeContext';
import { api } from '../../src/services/api';

const STATUS_META: Record<string, { label: string; color: string; hint: string }> = {
  open: { label: 'Ищем инспектора', color: '#F59E0B', hint: 'Инспекторы получили задание' },
  matching: { label: 'Ищем инспектора', color: '#F59E0B', hint: 'Инспекторы получили задание' },
  in_progress: { label: 'В работе', color: '#3B82F6', hint: 'Инспектор подтвердил задание' },
  report_ready: { label: 'Отчёт готов', color: '#10B981', hint: 'Проверьте результаты ниже' },
  completed: { label: 'Завершено', color: '#6B7280', hint: 'Заявка закрыта' },
  cancelled: { label: 'Отменено', color: '#9CA3AF', hint: 'Заявка отменена' },
};

// Granular inspector lifecycle (when an inspector is on the job).
// Maps inspection_job.status → customer-facing label.
const JOB_LIFECYCLE: Record<string, { label: string; color: string; hint: string; step: number }> = {
  claimed:    { label: 'Инспектор принял заявку', color: '#3B82F6', hint: 'Готовится к выезду', step: 1 },
  on_route:   { label: 'Инспектор в пути',         color: '#3B82F6', hint: 'Едет на встречу с продавцом', step: 2 },
  arrived:    { label: 'Инспектор на месте',       color: '#3B82F6', hint: 'Прибыл к автомобилю', step: 3 },
  inspecting: { label: 'Идёт проверка',            color: '#F59E0B', hint: 'Инспектор оценивает авто', step: 4 },
  done:       { label: 'Отчёт готов',              color: '#10B981', hint: 'Откройте отчёт ниже', step: 5 },
};

const LIFECYCLE_STEPS = ['claimed', 'on_route', 'arrived', 'inspecting', 'done'] as const;

const URGENCY_LABEL: Record<string, string> = {
  asap: 'Срочно · сегодня',
  '24h': '24 часа',
  week: 'В течение недели',
};

const FUEL_LABEL: Record<string, string> = {
  petrol: 'Бензин',
  diesel: 'Дизель',
  hybrid: 'Гибрид',
  electric: 'Электро',
};

const TRANSMISSION_LABEL: Record<string, string> = {
  manual: 'Механика',
  auto: 'Автомат',
};

type JobsPayload = {
  request: any;
  jobs: Array<{
    id: string;
    city: string;
    inspectorId: string | null;
    status: string;
  }>;
};

type Report = {
  id: string;
  requestId?: string;
  score?: number;
  riskLevel?: string;
  verdict?: string;
  createdAt?: string;
};

export default function RequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const [data, setData] = useState<JobsPayload | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [matching, setMatching] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [jobsRes, reportsRes, matchingRes] = await Promise.allSettled([
        api.get(`/customer/requests/${id}/jobs`),
        api.get(`/customer/requests/${id}/reports`),
        api.get(`/customer/requests/${id}/matching`),
      ]);
      if (jobsRes.status === 'fulfilled') {
        setData(jobsRes.value.data);
        setError(null);
      } else {
        setError('Не удалось загрузить заявку');
      }
      if (reportsRes.status === 'fulfilled') {
        const list = reportsRes.value.data?.items ?? reportsRes.value.data ?? [];
        setReports(Array.isArray(list) ? list : []);
      }
      if (matchingRes.status === 'fulfilled') {
        setMatching(matchingRes.value.data);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const req = data?.request;
  const jobs = data?.jobs ?? [];
  const meta = req ? STATUS_META[req.status] ?? { label: req.status, color: colors.textSecondary, hint: '' } : null;

  const openLink = (url: string) => {
    Linking.canOpenURL(url).then((ok) => {
      if (ok) Linking.openURL(url);
    });
  };

  const shareRequest = async () => {
    if (!req) return;
    const title = [req.brand, req.model].filter(Boolean).join(' ') || 'Моя заявка';
    try {
      await Share.share({ message: `Заявка ${title} · ${req.cities?.join(', ') ?? ''}` });
    } catch {}
  };

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} testID="req-back-btn">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Заявка</Text>
          <TouchableOpacity onPress={shareRequest} testID="req-share-btn">
            <Ionicons name="share-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : error || !req ? (
          <Text style={[styles.errorText, { color: '#EF4444' }]}>{error ?? 'Заявка не найдена'}</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {/* Status banner */}
            {meta && (
              <View style={[styles.statusBanner, { backgroundColor: `${meta.color}15` }]} testID={`req-status-${req.status}`}>
                <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
                  {meta.hint ? <Text style={[styles.statusHint, { color: colors.textSecondary }]}>{meta.hint}</Text> : null}
                </View>
              </View>
            )}

            {/* P0 — Live inspector lifecycle. Active while an assigned job
                is moving through claimed → on_route → arrived → inspecting → done. */}
            {(() => {
              const activeJob = jobs.find((j) => LIFECYCLE_STEPS.includes(j.status as any));
              if (!activeJob) return null;
              const lc = JOB_LIFECYCLE[activeJob.status];
              if (!lc) return null;
              const currentIdx = LIFECYCLE_STEPS.indexOf(activeJob.status as any);
              return (
                <View
                  testID="req-live-lifecycle"
                  style={[styles.lifecycleCard, { backgroundColor: colors.card, borderColor: lc.color }]}
                >
                  <View style={styles.lifecycleHead}>
                    <View style={[styles.lifecycleIconBox, { backgroundColor: `${lc.color}20` }]}>
                      <Ionicons
                        name={
                          activeJob.status === 'on_route' ? 'navigate'
                            : activeJob.status === 'arrived' ? 'location'
                            : activeJob.status === 'inspecting' ? 'construct'
                            : activeJob.status === 'done' ? 'checkmark-done-circle'
                            : 'briefcase'
                        }
                        size={22}
                        color={lc.color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lifecycleLabel, { color: lc.color }]}>{lc.label}</Text>
                      <Text style={[styles.lifecycleHint, { color: colors.textSecondary }]}>{lc.hint}</Text>
                    </View>
                  </View>
                  <View style={styles.lifecycleStepsRow}>
                    {LIFECYCLE_STEPS.map((s, idx) => {
                      const isDone = idx < currentIdx || activeJob.status === 'done';
                      const isCurrent = idx === currentIdx;
                      const dotColor = isDone ? '#10B981' : isCurrent ? lc.color : colors.border;
                      return (
                        <View key={s} style={styles.lifecycleStepCol}>
                          <View style={[styles.lifecycleDot, { backgroundColor: dotColor }]} />
                          {idx < LIFECYCLE_STEPS.length - 1 && (
                            <View style={[styles.lifecycleLine, { backgroundColor: idx < currentIdx ? '#10B981' : colors.border }]} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.lifecycleStepsLabels}>
                    {['Принято', 'В пути', 'На месте', 'Проверка', 'Отчёт'].map((label, idx) => (
                      <Text
                        key={idx}
                        style={[
                          styles.lifecycleStepLabel,
                          { color: idx <= currentIdx ? colors.text : colors.textSecondary },
                          idx === currentIdx && { fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Phase 3.0b STEP-1 — ETA pane. After payment the user lands here and sees
                a clear "we're working on it" timeline so they don't think their €149 vanished. */}
            {(req.status === 'open' || req.status === 'matching') && (
              <View
                testID="req-eta-pane"
                style={[styles.etaCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.etaHeaderRow}>
                  <View style={[styles.etaIconBox, { backgroundColor: 'rgba(245,184,0,0.15)' }]}>
                    <Ionicons name="time" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.etaTitle, { color: colors.text }]}>{t('eta.title')}</Text>
                    <Text style={[styles.etaSub, { color: colors.textSecondary }]}>{t('eta.subtitle')}</Text>
                  </View>
                </View>

                {/* 4-step timeline */}
                <View style={styles.etaTimeline}>
                  <EtaStep colors={colors} active={true}  done={true}  label={t('eta.step_paid')}   />
                  <EtaStep colors={colors} active={true}  done={false} label={t('eta.step_match')}  />
                  <EtaStep colors={colors} active={false} done={false} label={t('eta.step_visit')}  />
                  <EtaStep colors={colors} active={false} done={false} label={t('eta.step_report')} />
                </View>
              </View>
            )}

            {/* Matching progress — Phase 3 marketplace transparency */}
            {matching && matching.exposures && matching.exposures.total > 0 && (
              <View
                style={[styles.matchingCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                testID="matching-card"
              >
                <View style={styles.matchingHeaderRow}>
                  <Ionicons name="people-outline" size={18} color={colors.primary} />
                  <Text style={[styles.matchingTitle, { color: colors.text }]}>Процесс подбора инспектора</Text>
                </View>
                <Text style={[styles.matchingLabel, { color: colors.textSecondary }]}>{matching.label}</Text>

                <View style={styles.matchingBarWrap}>
                  {['visible', 'accepted', 'expired', 'rejected'].map((key) => {
                    const val = matching.exposures[key] ?? 0;
                    if (val === 0) return null;
                    const pct = (val / matching.exposures.total) * 100;
                    const color =
                      key === 'accepted' ? '#10B981' :
                      key === 'visible' ? '#3B82F6' :
                      key === 'rejected' ? '#EF4444' : '#9CA3AF';
                    return (
                      <View
                        key={key}
                        testID={`matching-bar-${key}`}
                        style={{ height: 6, flexBasis: `${pct}%`, backgroundColor: color }}
                      />
                    );
                  })}
                </View>

                <View style={styles.matchingStatsRow}>
                  <MatchStat colors={colors} color="#3B82F6" label="Получили" n={matching.exposures.visible} />
                  <MatchStat colors={colors} color="#10B981" label="Приняли" n={matching.exposures.accepted} />
                  <MatchStat colors={colors} color="#9CA3AF" label="Истекло" n={matching.exposures.expired} />
                  <MatchStat colors={colors} color={colors.textSecondary} label="Всего" n={matching.exposures.total} />
                </View>
              </View>
            )}

            {/* Kicker + title */}
            <Text style={[styles.kicker, { color: colors.primary }]}>
              {req.type === 'inspection' ? 'ПРОВЕРКА АВТО' : 'ПОДБОР АВТО'}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {[req.brand, req.model].filter(Boolean).join(' ') || 'Заявка на подбор'}
            </Text>

            {/* Key facts */}
            <View style={styles.factRow}>
              {req.budget > 0 && (
                <Fact colors={colors} icon="cash-outline" label="Бюджет" value={`до ${Number(req.budget).toLocaleString('de-DE')} €`} />
              )}
              {(req.yearFrom || req.yearTo) && (
                <Fact colors={colors} icon="calendar-outline" label="Годы" value={`${req.yearFrom ?? '—'} – ${req.yearTo ?? '—'}`} />
              )}
              {req.fuel && <Fact colors={colors} icon="water-outline" label="Топливо" value={FUEL_LABEL[req.fuel] ?? req.fuel} />}
              {req.transmission && <Fact colors={colors} icon="settings-outline" label="Коробка" value={TRANSMISSION_LABEL[req.transmission] ?? req.transmission} />}
              {req.mileageMax && (
                <Fact colors={colors} icon="speedometer-outline" label="Пробег до" value={`${Number(req.mileageMax).toLocaleString('de-DE')} км`} />
              )}
              {req.urgency && <Fact colors={colors} icon="time-outline" label="Срочность" value={URGENCY_LABEL[req.urgency] ?? req.urgency} />}
            </View>

            <Fact
              colors={colors}
              icon="location-outline"
              label="Локация"
              value={[req.country, (req.cities ?? []).join(' · ')].filter(Boolean).join(' · ') || '—'}
              full
            />

            {req.comment ? (
              <View style={[styles.commentBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.commentLabel, { color: colors.textSecondary }]}>Комментарий</Text>
                <Text style={[styles.commentText, { color: colors.text }]}>{req.comment}</Text>
              </View>
            ) : null}

            {/* Links */}
            {Array.isArray(req.links) && req.links.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Ссылки на объявления</Text>
                {req.links.map((url: string, i: number) => (
                  <TouchableOpacity
                    key={`${url}-${i}`}
                    testID={`req-link-${i}`}
                    onPress={() => openLink(url)}
                    style={[styles.linkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Ionicons name="link-outline" size={16} color={colors.primary} />
                    <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                      {url.replace(/^https?:\/\//, '')}
                    </Text>
                    <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Jobs progress */}
            <View style={styles.statsRow}>
              <Stat colors={colors} label="Всего" value={req.jobsTotal} />
              <Stat colors={colors} label="Принято" value={req.jobsClaimed} accent />
              <Stat colors={colors} label="Готово" value={req.jobsDone} />
            </View>

            {/* Jobs */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Инспекторские задания</Text>
            {jobs.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Задания не созданы</Text>
            ) : (
              jobs.map((j) => {
                const meta = STATUS_META[j.status] ?? { label: j.status, color: colors.textSecondary, hint: '' };
                return (
                  <View key={j.id} style={[styles.jobRow, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`job-${j.id}`}>
                    <View style={styles.jobLeft}>
                      <View style={[styles.jobIcon, { backgroundColor: `${meta.color}25` }]}>
                        <Ionicons name="location" size={16} color={meta.color} />
                      </View>
                      <View>
                        <Text style={[styles.jobCity, { color: colors.text }]}>{j.city}</Text>
                        <Text style={[styles.jobSub, { color: colors.textSecondary }]}>
                          {j.inspectorId ? `Инспектор · ${j.inspectorId.substring(0, 8)}…` : 'Ждём инспектора'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.pill, { backgroundColor: `${meta.color}20`, borderColor: meta.color }]}>
                      <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Reports */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Отчёты</Text>
            {reports.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Появятся здесь, когда инспектор завершит проверку
              </Text>
            ) : (
              reports.map((rep) => (
                <TouchableOpacity
                  key={rep.id}
                  testID={`req-report-${rep.id}`}
                  activeOpacity={0.85}
                  style={[styles.reportRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() =>
                    router.push({ pathname: '/dashboard/reports/[id]', params: { id: rep.id } } as any)
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reportTitle, { color: colors.text }]}>
                      Отчёт · {rep.verdict ?? 'готов'}
                    </Text>
                    {rep.createdAt && (
                      <Text style={[styles.reportDate, { color: colors.textSecondary }]}>
                        {new Date(rep.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                      </Text>
                    )}
                  </View>
                  {rep.score !== undefined && (
                    <View style={[styles.scoreBadge, { borderColor: rep.score >= 7 ? '#10B981' : rep.score >= 5 ? '#F59E0B' : '#EF4444' }]}>
                      <Text style={[styles.scoreText, { color: rep.score >= 7 ? '#10B981' : rep.score >= 5 ? '#F59E0B' : '#EF4444' }]}>
                        {rep.score.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function EtaStep({ colors, active, done, label }: { colors: any; active: boolean; done: boolean; label: string }) {
  const baseColor = done ? '#10B981' : active ? colors.primary : colors.border;
  return (
    <View style={styles.etaStep}>
      <View style={[styles.etaStepDot, { backgroundColor: baseColor, borderColor: baseColor }]}>
        {done ? (
          <Ionicons name="checkmark" size={11} color="#FFF" />
        ) : active ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : null}
      </View>
      <Text
        style={[
          styles.etaStepLabel,
          { color: active || done ? colors.text : colors.textSecondary, fontWeight: active || done ? '700' : '500' },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function Fact({ colors, icon, label, value, full }: any) {
  return (
    <View style={[styles.factBox, full && { flex: undefined, width: '100%' }, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.factHead}>
        <Ionicons name={icon} size={14} color={colors.textSecondary} />
        <Text style={[styles.factLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.factValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Stat({ colors, label, value, accent }: any) {
  return (
    <View
      style={[
        styles.statBox,
        {
          backgroundColor: accent ? `${colors.primary}15` : colors.card,
          borderColor: accent ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  body: { padding: 16, paddingBottom: 60 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 15, fontWeight: '700' },
  statusHint: { fontSize: 12, marginTop: 2 },

  // Live lifecycle card (P0)
  lifecycleCard: { borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 20 },
  lifecycleHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  lifecycleIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lifecycleLabel: { fontSize: 15, fontWeight: '800' },
  lifecycleHint: { fontSize: 12, marginTop: 2 },
  lifecycleStepsRow: { flexDirection: 'row', alignItems: 'center', height: 14, paddingHorizontal: 4 },
  lifecycleStepCol: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  lifecycleDot: { width: 12, height: 12, borderRadius: 6 },
  lifecycleLine: { flex: 1, height: 2 },
  lifecycleStepsLabels: { flexDirection: 'row', marginTop: 8, paddingHorizontal: 0 },
  lifecycleStepLabel: { flex: 1, fontSize: 10, textAlign: 'left' },

  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 6 },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  factBox: {
    flexBasis: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexGrow: 1,
    marginTop: 0,
  },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  factLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  factValue: { fontSize: 14, fontWeight: '700' },
  commentBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14 },
  commentLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  commentText: { fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 6,
  },
  linkText: { flex: 1, fontSize: 13, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  statBox: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  jobLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  jobIcon: { height: 36, width: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  jobCity: { fontSize: 15, fontWeight: '700' },
  jobSub: { fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '700' },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  reportTitle: { fontSize: 14, fontWeight: '700' },
  reportDate: { fontSize: 12, marginTop: 2 },
  scoreBadge: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scoreText: { fontSize: 14, fontWeight: '800' },
  emptyText: { fontSize: 13, fontStyle: 'italic', padding: 14 },
  errorText: { marginTop: 40, textAlign: 'center', fontWeight: '700' },
  // STEP-1 ETA pane
  etaCard: {
    marginVertical: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  etaHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  etaIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  etaTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  etaSub: { fontSize: 12, lineHeight: 17 },
  etaTimeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  etaStep: { flex: 1, alignItems: 'center' },
  etaStepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  etaStepLabel: { fontSize: 10, textAlign: 'center', lineHeight: 13 },
});
