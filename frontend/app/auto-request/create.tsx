// Phase 2 — Requests Engine. Two flows: inspection (link-based) / selection (filters-based).
// Phase 3.0b P0-1+P0-3: inline Stripe Checkout instead of credits/packages + i18n.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../../src/context/ThemeContext';
import { api } from '../../src/services/api';

type FlowType = 'inspection' | 'selection';
type City = { code: string; name: string; country: string; providersCount?: number; aliases?: string[] };

// Phase 3.0b — server-side pricing as fallback. Frontend fetches GET /api/pricing
// at mount and uses real values (single-inspection p1.price + selection basic plan).
// These hardcoded numbers are ONLY used while the API call is in-flight.
const PRICING_EUR_FALLBACK: Record<FlowType, number> = { inspection: 149, selection: 499 };

const COUNTRY_META: Record<string, { name: string; flag: string }> = {
  DE: { name: 'Deutschland', flag: '🇩🇪' },
  AT: { name: 'Österreich', flag: '🇦🇹' },
  FR: { name: 'France', flag: '🇫🇷' },
  IT: { name: 'Italia', flag: '🇮🇹' },
  NL: { name: 'Nederland', flag: '🇳🇱' },
  PL: { name: 'Polska', flag: '🇵🇱' },
  UA: { name: 'Україна', flag: '🇺🇦' },
  BE: { name: 'België', flag: '🇧🇪' },
  CZ: { name: 'Česko', flag: '🇨🇿' },
};

const URGENCY_OPTIONS = [
  { value: 'asap', labelKey: 'create.urgency_asap' },
  { value: '24h', labelKey: 'create.urgency_24h' },
  { value: 'week', labelKey: 'create.urgency_week' },
];

const FUEL_OPTIONS = [
  { value: 'petrol', labelKey: 'create.fuel_petrol' },
  { value: 'diesel', labelKey: 'create.fuel_diesel' },
  { value: 'hybrid', labelKey: 'create.fuel_hybrid' },
  { value: 'electric', labelKey: 'create.fuel_electric' },
];

const TRANSMISSION_OPTIONS = [
  { value: 'manual', labelKey: 'create.tx_manual' },
  { value: 'auto', labelKey: 'create.tx_auto' },
];

export default function CreateRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  // Step 0 = pick type; step 1 = fill form; preselect if ?type= provided
  const [step, setStep] = useState<0 | 1>(params.type === 'inspection' || params.type === 'selection' ? 1 : 0);
  const [flow, setFlow] = useState<FlowType>(
    params.type === 'inspection' ? 'inspection' : 'selection'
  );

  // Shared
  const [cities, setCities] = useState<string[]>([]); // city names
  const [country, setCountry] = useState<string>('DE');
  const [comment, setComment] = useState<string>('');
  const [cityModalOpen, setCityModalOpen] = useState(false);

  // Inspection
  const [link, setLink] = useState<string>('');
  const [urgency, setUrgency] = useState<string>('24h');

  // Selection
  const [brand, setBrand] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [budget, setBudget] = useState<string>('');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');
  const [fuel, setFuel] = useState<string>('');
  const [transmission, setTransmission] = useState<string>('');
  const [mileageMax, setMileageMax] = useState<string>('');

  // Cities catalogue
  const [allCities, setAllCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Phase 3.0c — Dynamic pricing from /api/pricing (admin-controlled).
  // Falls back to PRICING_EUR_FALLBACK during initial load.
  const [pricing, setPricing] = useState<Record<FlowType, number>>(PRICING_EUR_FALLBACK);
  useEffect(() => {
    let alive = true;
    api.get('/pricing').then((r) => {
      if (!alive) return;
      const insp = r.data?.inspection?.packages?.find((p: any) => p.count === 1)?.price;
      const sel = r.data?.selection?.plans?.find((p: any) => p.id === 'basic')?.price
                ?? r.data?.selection?.plans?.[0]?.price;
      setPricing({
        inspection: typeof insp === 'number' ? insp : PRICING_EUR_FALLBACK.inspection,
        selection: typeof sel === 'number' ? sel : PRICING_EUR_FALLBACK.selection,
      });
    }).catch(() => { /* fallback already in state */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    api
      .get('/cities')
      .then((r) => {
        if (mounted) setAllCities(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {})
      .finally(() => mounted && setCitiesLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Phase 3.0a — input validation (Funnel Stabilization).
  // Returns { ok, errors } where errors is a map fieldName → human message.
  // canSubmit becomes a derived flag (legacy callers untouched).
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    if (cities.length === 0) {
      errors.cities = t('create.err_pick_city') || 'Pick at least one city';
    }

    if (flow === 'inspection') {
      const v = link.trim();
      if (!v) {
        errors.link = t('create.err_link_empty') || 'Paste a link to the listing';
      } else {
        try {
          const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
          if (!u.host || !u.host.includes('.')) errors.link = t('create.err_link_invalid') || 'Enter a valid URL';
        } catch {
          errors.link = t('create.err_link_invalid') || 'Enter a valid URL';
        }
      }
    } else {
      // Selection: brand, model, budget, plus optional year/mileage validation.
      if (brand.trim().length === 0) errors.brand = t('create.err_brand') || 'Brand is required';
      if (model.trim().length === 0) errors.model = t('create.err_model') || 'Model is required';
      const b = Number(budget);
      if (!budget || b < 1000) errors.budget = t('create.err_budget_min') || 'Budget must be at least €1,000';

      if (yearFrom) {
        const yf = Number(yearFrom);
        if (yf < 1990) errors.yearFrom = t('create.err_year_min') || 'Minimum year — 1990';
        else if (yf > currentYear + 1) errors.yearFrom = `${t('create.err_year_max') || 'Maximum year'} — ${currentYear + 1}`;
      }
      if (yearTo) {
        const yt = Number(yearTo);
        if (yt < 1990) errors.yearTo = t('create.err_year_min') || 'Minimum year — 1990';
        else if (yt > currentYear + 1) errors.yearTo = `${t('create.err_year_max') || 'Maximum year'} — ${currentYear + 1}`;
      }
      if (yearFrom && yearTo) {
        const yf = Number(yearFrom);
        const yt = Number(yearTo);
        if (yf > yt) errors.yearTo = t('create.err_year_order') || 'Year-to must be ≥ year-from';
      }
      if (mileageMax) {
        const km = Number(mileageMax);
        if (km < 0) errors.mileageMax = t('create.err_mileage_negative') || 'Mileage cannot be negative';
        else if (km > 1_000_000) errors.mileageMax = t('create.err_mileage_max') || 'Mileage too high';
      }
    }

    return { ok: Object.keys(errors).length === 0, errors };
  }, [flow, cities, link, brand, model, budget, yearFrom, yearTo, mileageMax, t]);

  const canSubmit = validation.ok;

  const handlePickFlow = (f: FlowType) => {
    setFlow(f);
    setStep(1);
  };

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      // Phase 3.0b P0-1 — Build payload (frontend never sends amount; backend computes price from `type`).
      const requestPayload: Record<string, unknown> = {
        type: flow,
        country,
        cities,
        comment: comment || undefined,
      };
      if (flow === 'inspection') {
        requestPayload.links = [link.trim()];
        requestPayload.urgency = urgency;
      } else {
        requestPayload.brand = brand.trim();
        requestPayload.model = model.trim();
        requestPayload.budget = Number(budget);
        if (yearFrom) requestPayload.yearFrom = Number(yearFrom);
        if (yearTo) requestPayload.yearTo = Number(yearTo);
        if (fuel) requestPayload.fuel = fuel;
        if (transmission) requestPayload.transmission = transmission;
        if (mileageMax) requestPayload.mileageMax = Number(mileageMax);
      }

      // Origin URL must be the frontend host (not the backend) so Stripe redirects back to /payment-success.
      const originUrl =
        (Constants.expoConfig?.extra?.publicAppUrl as string | undefined) ||
        (typeof window !== 'undefined' ? window.location.origin : null) ||
        (process.env.EXPO_PUBLIC_BACKEND_URL as string | undefined) ||
        '';

      if (!originUrl) {
        Alert.alert(t('common.error') || 'Error', 'No origin URL configured');
        setSubmitting(false);
        return;
      }

      // 1) Create Stripe Checkout session — backend stores requestPayload + amount server-side
      const checkoutRes = await api.post('/payments/auto-request/checkout', {
        originUrl,
        requestPayload,
      });
      const { sessionId, url, amount, currency } = checkoutRes.data || {};
      if (!url || !sessionId) {
        Alert.alert(t('common.error') || 'Error', 'Checkout session creation failed');
        setSubmitting(false);
        return;
      }

      // 2) Open hosted Stripe Checkout. We rely on the `success_url` returning to
      //    /payment-success?session_id=... where polling finalises the request.
      //    On native, openAuthSessionAsync gives us a return result; on web, redirect navigation.
      if (Platform.OS === 'web') {
        // On web, just navigate the current tab — Stripe redirects back via success_url
        if (typeof window !== 'undefined') {
          window.location.href = url;
        }
        return;
      }

      // Native: open in-app browser; user comes back to app via deep link or by closing tab.
      // Pass session_id via app router so /payment-success can start polling immediately.
      const result = await WebBrowser.openAuthSessionAsync(url, `${originUrl}/payment-success?session_id=${sessionId}`);
      if (result.type === 'cancel' || result.type === 'dismiss') {
        // User cancelled — keep them on the form.
        setSubmitting(false);
        return;
      }
      // Success or unknown → take them to the polling screen.
      router.replace({ pathname: '/payment-success', params: { session_id: sessionId, amount: String(amount), currency } } as any);
    } catch (e: any) {
      const data = e?.response?.data;
      const msg = data?.detail?.[0]?.msg ?? data?.message ?? 'Payment session failed';
      Alert.alert(t('common.error') || 'Error', typeof msg === 'string' ? msg : 'Payment error');
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit, submitting, flow, country, cities, comment, link, urgency,
    brand, model, budget, yearFrom, yearTo, fuel, transmission, mileageMax, router, t,
  ]);

  // ─── Step 0: Flow picker ─────────────────────────
  if (step === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} testID="create-close-btn">
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scrollPad}>
            <Text style={[styles.h1, { color: colors.text }]}>{t('create.step0_title') || 'What would you like to do?'}</Text>
            <Text style={[styles.h1Sub, { color: colors.textSecondary }]}>
              {t('create.step0_sub') || 'Choose one of two flows — we will fill in the right fields next'}
            </Text>

            <TouchableOpacity
              testID="create-flow-inspection"
              activeOpacity={0.85}
              style={[styles.flowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handlePickFlow('inspection')}
            >
              <View style={[styles.flowIconBox, { backgroundColor: colors.primary }]}>
                <Ionicons name="shield-checkmark" size={26} color="#FFF" />
              </View>
              <View style={styles.flowContent}>
                <Text style={[styles.flowTitle, { color: colors.text }]}>{t('create.flow_inspection_title') || 'Inspect a specific car'}</Text>
                <Text style={[styles.flowSub, { color: colors.textSecondary }]}>
                  {t('create.flow_inspection_sub') || 'You have a listing link. An inspector will visit, check it and send you a report.'}
                </Text>
                <View style={styles.flowMeta}>
                  <Text style={[styles.flowMetaItem, { color: colors.textSecondary }]}>€{pricing.inspection} · 60 {t('create.points') || 'points'}</Text>
                  <Text style={[styles.flowMetaItem, { color: colors.textSecondary }]}>· {t('create.photo_video_24h') || 'photo + video · 24h'}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              testID="create-flow-selection"
              activeOpacity={0.85}
              style={[styles.flowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handlePickFlow('selection')}
            >
              <View style={[styles.flowIconBox, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="search" size={22} color="#FFF" />
              </View>
              <View style={styles.flowContent}>
                <Text style={[styles.flowTitle, { color: colors.text }]}>{t('create.flow_selection_title') || 'Find a car within budget'}</Text>
                <Text style={[styles.flowSub, { color: colors.textSecondary }]}>
                  {t('create.flow_selection_sub') || 'Not chosen yet. We find 3–5 candidates matching your filters and inspect them.'}
                </Text>
                <View style={styles.flowMeta}>
                  <Text style={[styles.flowMetaItem, { color: colors.textSecondary }]}>€{pricing.selection}</Text>
                  <Text style={[styles.flowMetaItem, { color: colors.textSecondary }]}>· {t('create.up_to_5_cars_48h') || 'up to 5 cars · 48h'}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Step 1: Form ─────────────────────────
  const selectedCitiesText = cities.length > 0 ? cities.join(', ') : (t('create.placeholder_city') || 'Pick a city');
  const supportsMulti = flow === 'selection';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => (params.type ? router.back() : setStep(0))}
            testID="create-back-btn"
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.text }]} numberOfLines={1}>
            {flow === 'inspection' ? (t('create.title_inspection') || 'Inspect a car') : (t('create.title_selection') || 'Find a car')}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollPad}
          keyboardShouldPersistTaps="handled"
        >
          {flow === 'inspection' ? (
            <InspectionForm
              colors={colors}
              link={link}
              setLink={setLink}
              urgency={urgency}
              setUrgency={setUrgency}
              country={country}
              setCountry={setCountry}
              cities={cities}
              selectedCitiesText={selectedCitiesText}
              openCityModal={() => setCityModalOpen(true)}
              comment={comment}
              setComment={setComment}
            />
          ) : (
            <SelectionForm
              colors={colors}
              brand={brand}
              setBrand={setBrand}
              model={model}
              setModel={setModel}
              budget={budget}
              setBudget={setBudget}
              yearFrom={yearFrom}
              setYearFrom={setYearFrom}
              yearTo={yearTo}
              setYearTo={setYearTo}
              fuel={fuel}
              setFuel={setFuel}
              transmission={transmission}
              setTransmission={setTransmission}
              mileageMax={mileageMax}
              setMileageMax={setMileageMax}
              country={country}
              setCountry={setCountry}
              cities={cities}
              selectedCitiesText={selectedCitiesText}
              openCityModal={() => setCityModalOpen(true)}
              comment={comment}
              setComment={setComment}
            />
          )}

          <View style={{ height: 16 }} />
          <Text style={[styles.priceNote, { color: colors.textSecondary }]}>
            {cities.length === 0
              ? (t('create.pick_city_first') || 'Pick at least one city')
              : flow === 'inspection'
                ? `${t('create.price_inspection_label') || 'Price per inspection'}: €${pricing.inspection}`
                : `${t('create.price_selection_label') || 'Price per selection'}: €${pricing.selection}`
            }
          </Text>

          {/* Phase 3.0b STEP-1 — Value proposition block. Shows BEFORE submit so the
              user understands exactly what they get for €149/€399. Reduces "is this
              a scam?" friction and lifts conversion. */}
          <ValuePropBlock colors={colors} />

          {/* Phase 3.0a — inline validation summary. Shows ALL field errors at once
              so the user understands what to fix before tapping the submit button.
              Hidden when canSubmit=true (no errors). */}
          {!canSubmit && Object.keys(validation.errors).length > 0 && (
            <View testID="create-validation-summary" style={[styles.errorBox, { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <View style={{ flex: 1 }}>
                {Object.entries(validation.errors).map(([field, msg]) => (
                  <Text key={field} testID={`create-error-${field}`} style={[styles.errorText, { color: '#EF4444' }]}>
                    · {msg}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.submitBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            testID="create-submit-btn"
            activeOpacity={0.85}
            disabled={!canSubmit || submitting}
            style={[
              styles.submitBtn,
              { backgroundColor: canSubmit ? colors.primary : colors.border },
            ]}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {flow === 'inspection'
                  ? `${t('create.cta_inspection') || 'Get full inspection report'} · €${pricing.inspection}`
                  : `${t('create.cta_selection') || 'Find & inspect 3–5 cars'} · €${pricing.selection}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <CityPickerModal
          visible={cityModalOpen}
          onClose={() => setCityModalOpen(false)}
          allCities={allCities}
          loading={citiesLoading}
          selected={cities}
          onChange={(next, pickedCountry) => {
            setCities(next);
            if (pickedCountry) setCountry(pickedCountry);
            if (!supportsMulti) setCityModalOpen(false);
          }}
          multi={supportsMulti}
          colors={colors}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ══════════ Inspection form ══════════
function InspectionForm(props: any) {
  const { t } = useTranslation();
  const { colors, link, setLink, urgency, setUrgency, country, setCountry, selectedCitiesText, openCityModal, comment, setComment, cities } = props;

  // P1.2 — Link preview: debounced fetch from /api/parse/car-link.
  // Shows the parsed BMW 320d / 2019 / €19 900 card while user types,
  // or a "manual" hint if the URL is unreachable.
  const [preview, setPreview] = React.useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  React.useEffect(() => {
    const v = (link || '').trim();
    if (!v || v.length < 12) { setPreview(null); return; }
    if (!/^https?:\/\//i.test(v)) { setPreview(null); return; }
    let alive = true;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      api.post('/parse/car-link', { url: v })
        .then((r) => { if (alive) setPreview(r.data); })
        .catch(() => { if (alive) setPreview({ parsed: false, error: 'fetch_failed' }); })
        .finally(() => { if (alive) setPreviewLoading(false); });
    }, 700);
    return () => { alive = false; clearTimeout(timer); };
  }, [link]);

  return (
    <>
      <Label colors={colors}>{t('create.label_link') || 'Listing link *'}</Label>
      <TextInput
        testID="create-input-link"
        value={link}
        onChangeText={setLink}
        placeholder={t('create.placeholder_link') || 'https://suchen.mobile.de/... or autoscout24 / kleinanzeigen'}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Hint colors={colors}>{t('create.hint_link_sources') || 'We support mobile.de · autoscout24 · kleinanzeigen · dealer sites'}</Hint>

      {/* P1.2 — Link preview card */}
      <LinkPreview colors={colors} loading={previewLoading} preview={preview} />

      <CountryRow colors={colors} country={country} setCountry={setCountry} />
      <CityField colors={colors} text={selectedCitiesText} onPress={openCityModal} selected={cities.length > 0} />

      <Label colors={colors}>{t('create.label_urgency') || 'Urgency'}</Label>
      <ChipRow
        options={URGENCY_OPTIONS}
        value={urgency}
        onChange={setUrgency}
        colors={colors}
        testIdPrefix="create-urgency"
      />

      <Label colors={colors}>{t('create.label_comment') || 'Comment (optional)'}</Label>
      <TextInput
        testID="create-input-comment"
        value={comment}
        onChangeText={setComment}
        placeholder={t('create.placeholder_comment_inspection') || 'What is most important to check?'}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, styles.textArea, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
        multiline
        numberOfLines={3}
      />
    </>
  );
}

// ══════════ Link preview card (P1.2) ══════════
// Shows: image + title + meta (year/km/fuel) + price + market-avg delta + source badge.
// 3 states: loading skeleton · parsed card · "manual fallback" hint.
// Tapping the preview opens free risk-preview (P1.5).
function LinkPreview({ colors, loading, preview }: { colors: any; loading: boolean; preview: any }) {
  const { t } = useTranslation();
  const router = useRouter();

  if (loading) {
    return (
      <View testID="link-preview-loading" style={[lpStyles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[lpStyles.loadingText, { color: colors.textSecondary }]}>
          {t('create.link_analyzing') || 'Analyzing car…'}
        </Text>
      </View>
    );
  }

  if (!preview) return null;

  // Phase C.1 — Link Intelligence Core unified shape:
  //   { recognized, softFail, hardFail, source, title, image, price, year, mileage, fuel, ... }
  // Back-compat with legacy `parsed` field.
  const recognized = preview.recognized ?? preview.parsed ?? false;
  const softFail = !!preview.softFail;
  const hardFail = !!preview.hardFail;

  // softFail / hardFail UI — never block, never say "broken".
  if (!recognized) {
    const isSoft = softFail || (!hardFail);  // default to soft when ambiguous
    const title = isSoft
      ? (t('create.link_parse_unavailable') || 'Preview unavailable')
      : (t('create.link_parse_failed') || 'Unsupported website');
    const sub = isSoft
      ? (t('create.link_parse_unavailable_sub') || 'The site blocks auto-fetch — link accepted, the inspector will open it on-site')
      : (t('create.link_parse_failed_sub') || 'Try mobile.de, AutoScout24 or Kleinanzeigen');
    const tint = isSoft ? '#22C55E' : colors.primary;
    const bg = isSoft ? 'rgba(34,197,94,0.12)' : 'rgba(245,184,0,0.15)';
    return (
      <View testID="link-preview-failed" style={[lpStyles.failedBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[lpStyles.failedIconBox, { backgroundColor: bg }]}>
          <Ionicons name={isSoft ? 'shield-checkmark' : 'alert-circle-outline'} size={18} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[lpStyles.failedTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[lpStyles.failedSub, { color: colors.textSecondary }]}>{sub}</Text>
        </View>
      </View>
    );
  }

  // Build display strings — fall back gracefully for missing fields.
  const title =
    preview.title ||
    [preview.make, preview.model].filter(Boolean).join(' ') ||
    'Vehicle';
  const fmt = (n: number) => Number(n).toLocaleString('de-DE');
  const priceStr = preview.price ? `€${fmt(preview.price)}` : '—';
  const yearStr = preview.year ? String(preview.year) : null;
  const kmStr = preview.mileage ? `${fmt(preview.mileage)} km` : null;
  const fuelStr = preview.fuel ? String(preview.fuel).toUpperCase() : null;
  const cityStr = preview.city || null;
  const sourceLabel: Record<string, string> = {
    'mobile.de': 'mobile.de',
    'autoscout24.de': 'AutoScout24',
    'kleinanzeigen.de': 'Kleinanzeigen',
    'heycar': 'heycar',
    'pkw.de': 'PKW.de',
    'generic': 'dealer site',
  };
  const sourceTxt = preview.source ? (sourceLabel[preview.source] || preview.source) : 'dealer';

  // Market delta (for trust + curiosity)
  let deltaTxt: string | null = null;
  let deltaColor = colors.textSecondary;
  if (preview.price && preview.marketAvg && preview.marketAvg > 0) {
    const pct = Math.round((1 - preview.price / preview.marketAvg) * 100);
    if (pct >= 5) {
      deltaTxt = `${pct}% ${t('create.preview_below_market') || 'below market'}`;
      deltaColor = pct >= 20 ? '#EF4444' : '#22C55E';
    } else if (pct <= -10) {
      deltaTxt = `${Math.abs(pct)}% ${t('create.preview_above_market') || 'above market'}`;
      deltaColor = '#FFB020';
    }
  }

  const hasImage = typeof preview.image === 'string' && /^https?:\/\//i.test(preview.image);

  const goPreview = () => {
    if (preview.sourceUrl) {
      // Cast: expo-router typed routes are generated at build; new screen not yet in registry.
      router.push({ pathname: '/inspection-preview' as any, params: { url: preview.sourceUrl } });
    }
  };

  return (
    <TouchableOpacity
      testID="link-preview-card"
      activeOpacity={0.85}
      onPress={goPreview}
      style={[lpStyles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}
    >
      {hasImage ? (
        <Image
          source={{ uri: preview.image }}
          style={lpStyles.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[lpStyles.imagePlaceholder, { backgroundColor: 'rgba(245,184,0,0.10)' }]}>
          <Ionicons name="car-sport" size={36} color={colors.primary} />
        </View>
      )}

      <View style={lpStyles.body}>
        <View style={lpStyles.topRow}>
          <View style={[lpStyles.checkBadge, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
            <Text style={[lpStyles.checkBadgeText, { color: '#22C55E' }]}>
              {t('create.link_detected') || '✓ Car recognized'}
            </Text>
          </View>
          <Text style={[lpStyles.sourceTxt, { color: colors.textSecondary }]} numberOfLines={1}>
            {sourceTxt}
          </Text>
        </View>

        <Text testID="link-preview-title" style={[lpStyles.title, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>

        <View style={lpStyles.metaRow}>
          {yearStr && <MetaChip icon="calendar-outline" text={yearStr} colors={colors} />}
          {kmStr && <MetaChip icon="speedometer-outline" text={kmStr} colors={colors} />}
          {fuelStr && <MetaChip icon="flash-outline" text={fuelStr} colors={colors} />}
          {cityStr && <MetaChip icon="location-outline" text={cityStr} colors={colors} />}
        </View>

        <View style={lpStyles.priceRow}>
          <Text testID="link-preview-price" style={[lpStyles.priceTxt, { color: colors.text }]}>{priceStr}</Text>
          {deltaTxt && (
            <View style={[lpStyles.deltaPill, { borderColor: deltaColor }]}>
              <Text style={[lpStyles.deltaTxt, { color: deltaColor }]}>{deltaTxt}</Text>
            </View>
          )}
        </View>

        <View style={[lpStyles.ctaRow, { borderTopColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
          <Text style={[lpStyles.ctaTxt, { color: colors.primary }]}>
            {t('create.link_preview_cta') || 'See free risk preview →'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MetaChip({ icon, text, colors }: { icon: any; text: string; colors: any }) {
  return (
    <View style={[lpStyles.metaChip, { backgroundColor: 'rgba(127,127,127,0.10)' }]}>
      <Ionicons name={icon} size={12} color={colors.textSecondary} />
      <Text style={[lpStyles.metaChipTxt, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const lpStyles = StyleSheet.create({
  // Loading
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  loadingText: { fontSize: 13, fontWeight: '600' },
  // Parsed card
  card: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  image: { width: '100%', height: 160 },
  imagePlaceholder: {
    width: '100%',
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 14, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  checkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  checkBadgeText: { fontSize: 11, fontWeight: '700' },
  sourceTxt: { fontSize: 11, fontWeight: '600', textTransform: 'lowercase' },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 22, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metaChipTxt: { fontSize: 12, fontWeight: '600' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  priceTxt: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  deltaTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  ctaTxt: { fontSize: 13, fontWeight: '800' },
  // Failed fallback
  failedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  failedIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedTitle: { fontSize: 13, fontWeight: '700' },
  failedSub: { fontSize: 12, marginTop: 2 },
});

// ══════════ Selection form ══════════
function SelectionForm(props: any) {
  const { t } = useTranslation();
  const { colors, brand, setBrand, model, setModel, budget, setBudget, yearFrom, setYearFrom, yearTo, setYearTo, fuel, setFuel, transmission, setTransmission, mileageMax, setMileageMax, country, setCountry, selectedCitiesText, openCityModal, comment, setComment, cities } = props;
  return (
    <>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Label colors={colors}>{t('create.label_brand') || 'Brand *'}</Label>
          <TextInput
            testID="create-input-brand"
            value={brand}
            onChangeText={setBrand}
            placeholder="BMW"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label colors={colors}>{t('create.label_model') || 'Model *'}</Label>
          <TextInput
            testID="create-input-model"
            value={model}
            onChangeText={setModel}
            placeholder="320d"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        </View>
      </View>

      <Label colors={colors}>{t('create.label_budget') || 'Budget, € *'}</Label>
      <TextInput
        testID="create-input-budget"
        value={budget}
        onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ''))}
        placeholder="20000"
        placeholderTextColor={colors.textSecondary}
        keyboardType="numeric"
        style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
      />

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Label colors={colors}>{t('create.label_year_from') || 'Year from'}</Label>
          <TextInput
            testID="create-input-year-from"
            value={yearFrom}
            onChangeText={(v) => setYearFrom(v.replace(/[^0-9]/g, ''))}
            placeholder="2018"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            maxLength={4}
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label colors={colors}>{t('create.label_year_to') || 'Year to'}</Label>
          <TextInput
            testID="create-input-year-to"
            value={yearTo}
            onChangeText={(v) => setYearTo(v.replace(/[^0-9]/g, ''))}
            placeholder="2023"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            maxLength={4}
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        </View>
      </View>

      <Label colors={colors}>{t('create.label_fuel') || 'Fuel'}</Label>
      <ChipRow options={FUEL_OPTIONS} value={fuel} onChange={setFuel} colors={colors} testIdPrefix="create-fuel" allowClear />

      <Label colors={colors}>{t('create.label_transmission') || 'Transmission'}</Label>
      <ChipRow options={TRANSMISSION_OPTIONS} value={transmission} onChange={setTransmission} colors={colors} testIdPrefix="create-trans" allowClear />

      <Label colors={colors}>{t('create.label_mileage_max') || 'Max mileage, km'}</Label>
      <TextInput
        testID="create-input-mileage"
        value={mileageMax}
        onChangeText={(v) => setMileageMax(v.replace(/[^0-9]/g, ''))}
        placeholder="120000"
        placeholderTextColor={colors.textSecondary}
        keyboardType="numeric"
        style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
      />

      <CountryRow colors={colors} country={country} setCountry={setCountry} />
      <CityField
        colors={colors}
        text={selectedCitiesText}
        onPress={openCityModal}
        selected={cities.length > 0}
        hint={t('create.hint_cities_multi') || 'You can pick multiple cities — one inspection per city'}
      />

      <Label colors={colors}>{t('create.label_comment') || 'Comment (optional)'}</Label>
      <TextInput
        testID="create-input-comment"
        value={comment}
        onChangeText={setComment}
        placeholder={t('create.placeholder_comment_selection') || 'What matters to you? Family, low fuel, winter tires...'}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, styles.textArea, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
        multiline
        numberOfLines={3}
      />
    </>
  );
}

// ══════════ Helpers ══════════
const Label = ({ colors, children }: any) => (
  <Text style={[styles.label, { color: colors.text }]}>{children}</Text>
);
const Hint = ({ colors, children }: any) => (
  <Text style={[styles.hint, { color: colors.textSecondary }]}>{children}</Text>
);

// ══════════ Value proposition (STEP-1: pre-payment trust) ══════════
function ValuePropBlock({ colors }: { colors: any }) {
  const { t } = useTranslation();
  const items = [
    { icon: 'shield-checkmark' as const, title: t('value_prop.p1_title'), sub: t('value_prop.p1_sub') },
    { icon: 'camera' as const,           title: t('value_prop.p2_title'), sub: t('value_prop.p2_sub') },
    { icon: 'cog' as const,              title: t('value_prop.p3_title'), sub: t('value_prop.p3_sub') },
    { icon: 'analytics' as const,        title: t('value_prop.p4_title'), sub: t('value_prop.p4_sub') },
    { icon: 'time' as const,             title: t('value_prop.p5_title'), sub: t('value_prop.p5_sub') },
    { icon: 'lock-closed' as const,      title: t('value_prop.p6_title'), sub: t('value_prop.p6_sub') },
  ];
  const checkItems = [
    t('value_prop.check_engine'),
    t('value_prop.check_gearbox'),
    t('value_prop.check_body'),
    t('value_prop.check_mileage'),
    t('value_prop.check_obd'),
    t('value_prop.check_testdrive'),
  ];
  return (
    <View
      testID="create-value-prop"
      style={[styles.vpBox, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Pain hook — connects to real fear */}
      <Text testID="create-value-prop-kicker" style={[styles.vpKicker, { color: colors.primary }]}>
        {t('value_prop.kicker')}
      </Text>
      <Text style={[styles.vpTitle, { color: colors.text }]}>{t('value_prop.title')}</Text>
      {items.map((item, idx) => (
        <View key={idx} style={styles.vpRow} testID={`create-value-prop-item-${idx}`}>
          <View style={[styles.vpIconBox, { backgroundColor: 'rgba(245,184,0,0.15)' }]}>
            <Ionicons name={item.icon} size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.vpItemTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.vpItemSub, { color: colors.textSecondary }]}>{item.sub}</Text>
          </View>
        </View>
      ))}

      {/* Specifics block — what exactly will be checked */}
      <View testID="create-what-we-check" style={[styles.vpCheckBox, { borderTopColor: colors.border }]}>
        <Text style={[styles.vpCheckTitle, { color: colors.text }]}>
          {t('value_prop.check_title')}
        </Text>
        {checkItems.map((label, idx) => (
          <View key={idx} testID={`create-check-item-${idx}`} style={styles.vpCheckRow}>
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.vpCheckText, { color: colors.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ChipRow({ options, value, onChange, colors, testIdPrefix, allowClear }: any) {
  const { t } = useTranslation();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {options.map((o: any) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            testID={`${testIdPrefix}-${o.value}`}
            onPress={() => onChange(allowClear && active ? '' : o.value)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary : colors.card,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? '#FFF' : colors.text }]}>
              {o.labelKey ? (t(o.labelKey) as string) : o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function CountryRow({ colors, country, setCountry }: any) {
  const { t } = useTranslation();
  const list = Object.entries(COUNTRY_META);
  return (
    <>
      <Label colors={colors}>{t('create.label_country') || 'Country'}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {list.map(([code, meta]) => {
          const active = code === country;
          return (
            <TouchableOpacity
              key={code}
              testID={`create-country-${code}`}
              onPress={() => setCountry(code)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#FFF' : colors.text }]}>
                {meta.flag} {meta.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );
}

function CityField({ colors, text, onPress, selected, hint }: any) {
  const { t } = useTranslation();
  return (
    <>
      <Label colors={colors}>{t('create.label_city') || 'City *'}</Label>
      <TouchableOpacity
        testID="create-city-field"
        activeOpacity={0.8}
        onPress={onPress}
        style={[styles.input, styles.cityField, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
        <Text
          style={[styles.cityFieldText, { color: selected ? colors.text : colors.textSecondary }]}
          numberOfLines={1}
        >
          {text}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      {hint && <Hint colors={colors}>{hint}</Hint>}
    </>
  );
}

// ══════════ City picker modal ══════════
function CityPickerModal({
  visible, onClose, allCities, loading, selected, onChange, multi, colors,
}: any) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return allCities;
    return allCities.filter(
      (c: City) =>
        fold(c.name).includes(q) ||
        c.code.includes(q) ||
        fold(c.country).includes(q) ||
        (c.aliases || []).some((alias) => fold(alias).includes(q))
    );
  }, [allCities, query]);

  // Group by country
  const grouped = useMemo(() => {
    const map: Record<string, City[]> = {};
    for (const c of filtered) {
      const cc = c.country || '??';
      (map[cc] ||= []).push(c);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggle = (city: City) => {
    const isOn = selected.includes(city.name);
    let next: string[];
    if (multi) {
      next = isOn ? selected.filter((s: string) => s !== city.name) : [...selected, city.name];
    } else {
      next = isOn ? [] : [city.name];
    }
    onChange(next, city.country);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} testID="city-modal-close">
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{t('create.modal_pick_city') || 'Choose city'}</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            testID="city-modal-search"
            value={query}
            onChangeText={setQuery}
            placeholder={t('common.search') || 'Search'}
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : grouped.length === 0 ? (
          <View style={styles.modalEmpty} testID="city-modal-empty">
            <Text style={[styles.modalEmptyTitle, { color: colors.text }]}>{t('create.city_not_found') || 'City not found'}</Text>
            <Text style={[styles.modalEmptySub, { color: colors.textSecondary }]}>
              {t('create.city_not_found_hint') || 'Contact support — we will add new cities within 48 hours'}
            </Text>
            <TouchableOpacity
              testID="city-suggest-btn"
              style={[styles.suggestBtn, { borderColor: colors.primary }]}
              onPress={() => {
                Alert.alert(
                  t('create.city_request_sent_title') || 'Request sent',
                  `${t('create.city_request_sent_body') || 'We will review adding the city'} "${query}" ${t('create.within_48h') || 'within 48 hours.'}`
                );
                onClose();
              }}
            >
              <Text style={[styles.suggestBtnText, { color: colors.primary }]}>{t('create.suggest_city') || 'Suggest a city'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {grouped.map(([cc, items]) => {
              const meta = COUNTRY_META[cc] ?? { name: cc, flag: '🌍' };
              return (
                <View key={cc}>
                  <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>
                    {meta.flag}  {meta.name}
                  </Text>
                  {items.map((c: City) => {
                    const isOn = selected.includes(c.name);
                    return (
                      <TouchableOpacity
                        key={c.code}
                        testID={`city-option-${c.code}`}
                        onPress={() => toggle(c)}
                        style={[styles.cityRow, { borderBottomColor: colors.border }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cityName, { color: colors.text }]}>{c.name}</Text>
                          {typeof c.providersCount === 'number' && (
                            <Text style={[styles.cityMeta, { color: colors.textSecondary }]}>
                              {c.providersCount > 0
                                ? `${c.providersCount} ${t('create.inspectors_count') || 'inspectors'}`
                                : (t('create.inspectors_searching') || 'Looking for inspectors (may take longer)')}
                            </Text>
                          )}
                        </View>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: isOn ? colors.primary : colors.border,
                              backgroundColor: isOn ? colors.primary : 'transparent',
                            },
                          ]}
                        >
                          {isOn && <Ionicons name="checkmark" size={16} color="#FFF" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
            {multi && (
              <TouchableOpacity
                testID="city-modal-done"
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={onClose}
              >
                <Text style={styles.doneBtnText}>
                  {t('common.confirm') || 'Done'} ({selected.length})
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  scrollPad: { padding: 18, paddingBottom: 120 },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  h1Sub: { fontSize: 14, marginTop: 8, marginBottom: 24, lineHeight: 20 },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
  },
  flowIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowContent: { flex: 1 },
  flowTitle: { fontSize: 16, fontWeight: '700' },
  flowSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  flowMeta: { flexDirection: 'row', marginTop: 8 },
  flowMetaItem: { fontSize: 11, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    fontSize: 14,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  hint: { fontSize: 11, marginTop: 4 },
  row2: { flexDirection: 'row', gap: 10 },
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  cityField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  cityFieldText: { flex: 1, fontSize: 14 },
  priceNote: { fontSize: 12, textAlign: 'center', marginTop: 12 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  errorText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  submitBar: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14 },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cityName: { fontSize: 15, fontWeight: '600' },
  cityMeta: { fontSize: 12, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    margin: 16,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  modalEmpty: { padding: 32, alignItems: 'center' },
  modalEmptyTitle: { fontSize: 16, fontWeight: '700' },
  modalEmptySub: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  suggestBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestBtnText: { fontSize: 14, fontWeight: '700' },
  // Value-prop block (STEP-1)
  vpBox: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  vpTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12, letterSpacing: 0.2 },
  vpKicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  vpRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  vpIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  vpItemTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  vpItemSub: { fontSize: 12, lineHeight: 16 },
  vpCheckBox: {
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  vpCheckTitle: { fontSize: 13, fontWeight: '800', marginBottom: 10, letterSpacing: 0.2 },
  vpCheckRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  vpCheckText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
