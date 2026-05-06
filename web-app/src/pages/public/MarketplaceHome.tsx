// ══════════════════════════════════════════════════════════════════
// MarketplaceHome — Sprint 1 "Separation + Repositioning"
// CORE: Auto Selection Marketplace (проверка/подбор авто перед покупкой).
// Repair/СТО оставлен как SECONDARY-блок ниже.
// ══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search, MapPin, Star, ShieldCheck, Clock, Wrench, ArrowRight,
  Link2, Scale, ClipboardCheck, FileCheck2, Camera, ShieldAlert, Euro,
} from 'lucide-react';
import { marketplaceAPI } from '../../services/api';
import { ProviderCard } from '../../components/marketplace/ProviderCard';

const REPAIR_CHIP_KEYS = [
  'engine_wont_start',
  'urgent',
  'diagnostics',
  'oil_change',
  'brakes',
  'electrical',
  'suspension',
];

export default function MarketplaceHome() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [providers, setProviders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('Berlin');
  const [inspectUrl, setInspectUrl] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [providersRes, statsRes] = await Promise.all([
        marketplaceAPI.getProviders(),
        marketplaceAPI.getStats(),
      ]);
      const list = providersRes.data?.providers ?? providersRes.data ?? [];
      setProviders(Array.isArray(list) ? list : []);
      setStats(statsRes.data);
    } catch (e) {
      console.error('home load failed', e);
    }
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (city) params.set('city', city);
    navigate(`/search?${params.toString()}`);
  };

  const submitInspect = (e: React.FormEvent) => {
    e.preventDefault();
    if (inspectUrl.trim()) {
      navigate(`/inspect?url=${encodeURIComponent(inspectUrl.trim())}`);
    } else {
      navigate('/inspect');
    }
  };

  const onChip = (problem: string) => {
    navigate(`/search?problem=${problem}`);
  };

  return (
    <div data-testid="marketplace-home">
      {/* ══════════════════════════════════════════════════════════════
          🟡 CORE HERO — Auto Selection Marketplace (inspection-first)
          ══════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden border-b border-[var(--border)] bg-gradient-to-b from-[#fffaed] via-white to-white"
        data-testid="selection-hero"
      >
        <div className="mx-auto max-w-7xl px-4 md:px-6 pt-14 pb-16">
          <div className="max-w-4xl">
            <p
              className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary-h)]"
              data-testid="selection-eyebrow"
            >
              <ShieldCheck size={14} /> {t('selection.hero.eyebrow')}
            </p>
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--text)] leading-[1.05]"
              data-testid="selection-title"
            >
              {t('selection.hero.title')}
            </h1>
            <p
              className="mt-5 max-w-2xl text-lg md:text-xl text-[var(--text-2)]"
              data-testid="selection-subtitle"
            >
              {t('selection.hero.subtitle')}
            </p>
          </div>

          {/* Fast inspect-by-URL form */}
          <form
            onSubmit={submitInspect}
            className="mt-8 max-w-3xl rounded-2xl border border-[var(--border)] bg-white p-3 md:p-4 shadow-[var(--shadow-card)]"
            data-testid="selection-inspect-form"
          >
            <div className="flex flex-col md:flex-row gap-2 md:gap-3">
              <div className="flex-1 input-shell input-lg">
                <Link2 size={18} className="text-[var(--text-soft)]" />
                <input
                  value={inspectUrl}
                  onChange={(e) => setInspectUrl(e.target.value)}
                  placeholder={t('selection.hero.url_placeholder')}
                  data-testid="selection-inspect-url"
                  inputMode="url"
                />
              </div>
              <button type="submit" className="btn-primary btn-lg md:w-auto" data-testid="selection-inspect-submit">
                <ShieldCheck size={16} /> {t('selection.hero.inspect_btn')}
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--text-soft)]">
              {t('selection.hero.url_hint')}
            </p>
          </form>

          {/* Three primary CTAs */}
          <div className="mt-8 grid gap-4 md:grid-cols-3" data-testid="selection-primary-ctas">
            <CoreCard
              to="/inspect"
              icon={<ShieldCheck size={22} />}
              kicker={t('selection.cards.inspect.kicker')}
              title={t('selection.cards.inspect.title')}
              desc={t('selection.cards.inspect.desc')}
              testId="cta-inspect"
              primary
            />
            <CoreCard
              to="/selection-request"
              icon={<ClipboardCheck size={22} />}
              kicker={t('selection.cards.selection.kicker')}
              title={t('selection.cards.selection.title')}
              desc={t('selection.cards.selection.desc')}
              testId="cta-selection-request"
            />
            <CoreCard
              to="/comparison"
              icon={<Scale size={22} />}
              kicker={t('selection.cards.compare.kicker')}
              title={t('selection.cards.compare.title')}
              desc={t('selection.cards.compare.desc')}
              testId="cta-comparison"
            />
          </div>

          {/* Trust strip */}
          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-[var(--text-2)]" data-testid="selection-trust">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--success)]" />
              {t('selection.trust.tuv')}
            </span>
            <span className="inline-flex items-center gap-2">
              <Euro size={16} className="text-[var(--primary)]" />
              {t('selection.trust.fixed_price')}
            </span>
            <span className="inline-flex items-center gap-2">
              <FileCheck2 size={16} className="text-[var(--warning)]" />
              {t('selection.trust.report_24h')}
            </span>
            <span className="inline-flex items-center gap-2">
              <Camera size={16} className="text-[var(--text-2)]" />
              {t('selection.trust.photos_videos')}
            </span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          🟡 PACKAGES — CTA to real /packages page (Sprint 3 live)
          ══════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 pt-14 pb-4" data-testid="selection-packages">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-h)]">{t('selection.packages.eyebrow')}</p>
            <h2 className="text-2xl md:text-3xl font-extrabold mt-1">{t('selection.packages.title')}</h2>
            <p className="mt-1 text-[var(--text-2)]">{t('selection.packages.subtitle')}</p>
          </div>
          <Link to="/packages" className="btn-primary btn-lg" data-testid="packages-cta">
            {t('packages.pay_card')} →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/packages" className="block" data-testid="home-pkg-one">
            <PackageCard label={t('selection.packages.one.label')} price="€120"
              perks={[t('selection.packages.one.perk1'), t('selection.packages.one.perk2'), t('selection.packages.one.perk3')]} testId="pkg-one" />
          </Link>
          <Link to="/packages" className="block" data-testid="home-pkg-three">
            <PackageCard label={t('selection.packages.three.label')} price="€300" highlight badge={t('selection.packages.three.badge')}
              perks={[t('selection.packages.three.perk1'), t('selection.packages.three.perk2'), t('selection.packages.three.perk3')]} testId="pkg-three" />
          </Link>
          <Link to="/packages" className="block" data-testid="home-pkg-five">
            <PackageCard label={t('selection.packages.five.label')} price="€450"
              perks={[t('selection.packages.five.perk1'), t('selection.packages.five.perk2'), t('selection.packages.five.perk3')]} testId="pkg-five" />
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          🟡 HOW IT WORKS (for Auto Selection)
          ══════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 pt-10 pb-16" data-testid="selection-how">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-h)]">{t('selection.how.eyebrow')}</p>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-1">{t('selection.how.title')}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Step n={1} title={t('selection.how.step1_title')} text={t('selection.how.step1_text')} icon={<Link2 size={18} />} />
          <Step n={2} title={t('selection.how.step2_title')} text={t('selection.how.step2_text')} icon={<ClipboardCheck size={18} />} />
          <Step n={3} title={t('selection.how.step3_title')} text={t('selection.how.step3_text')} icon={<ShieldAlert size={18} />} />
          <Step n={4} title={t('selection.how.step4_title')} text={t('selection.how.step4_text')} icon={<FileCheck2 size={18} />} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          🔵 SECONDARY: Repair / СТО (legacy, дополнительный модуль)
          ══════════════════════════════════════════════════════════════ */}
      <section
        className="border-t border-[var(--border)] bg-[var(--surface-soft)]"
        data-testid="repair-secondary"
      >
        <div className="mx-auto max-w-7xl px-4 md:px-6 pt-12 pb-16">
          <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-soft)]">
                {t('repair.eyebrow')}
              </p>
              <h2 className="text-2xl md:text-3xl font-extrabold mt-1" data-testid="repair-title">
                {t('repair.title')}
              </h2>
              <p className="mt-1 text-[var(--text-2)] max-w-2xl">{t('repair.subtitle')}</p>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div>
              {/* Repair search box (existing functionality preserved) */}
              <form
                onSubmit={submitSearch}
                className="rounded-2xl border border-[var(--border)] bg-white p-3 md:p-4 shadow-[var(--shadow-card)]"
                data-testid="repair-search-form"
              >
                <div className="flex flex-col md:flex-row gap-2 md:gap-3">
                  <div className="flex-1 input-shell input-lg">
                    <Search size={18} className="text-[var(--text-soft)]" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={t('home.search_placeholder')}
                      data-testid="repair-search-q"
                    />
                  </div>
                  <div className="md:w-48 input-shell input-lg">
                    <MapPin size={18} className="text-[var(--text-soft)]" />
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder={t('home.city_placeholder')}
                      data-testid="repair-search-city"
                    />
                  </div>
                  <button type="submit" className="btn-dark btn-lg md:w-auto" data-testid="repair-search-submit">
                    <Search size={16} /> {t('home.search_btn')}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2" data-testid="repair-problem-chips">
                  {REPAIR_CHIP_KEYS.map((key) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => onChip(key)}
                      className="chip"
                      data-testid={`repair-chip-${key}`}
                    >
                      {t(`home.chips.${key}`)}
                    </button>
                  ))}
                </div>
              </form>

              {/* Recommended providers (repair) */}
              {providers.length === 0 ? null : (
                <div className="mt-8">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <h3 className="text-xl font-extrabold">{t('home.recommended.title')}</h3>
                    <Link to="/search" className="text-sm font-bold inline-flex items-center gap-1 hover:text-[var(--primary-h)]" data-testid="repair-view-all">
                      {t('home.recommended.view_all')} <ArrowRight size={14} />
                    </Link>
                  </div>
                  <div className="grid gap-4">
                    {providers.slice(0, 3).map((p) => (
                      <ProviderCard key={p.id || p._id || p.slug} provider={p} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live sidebar */}
            <aside
              className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] h-fit"
              data-testid="repair-live-stats"
            >
              <div className="mb-4 flex items-center gap-2">
                <span className="live-dot" />
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-2)]">
                  {t('home.live.title')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t('home.live.providers_online')} value={stats?.onlineProviders ?? '—'} />
                <Stat label={t('home.live.avg_eta')} value={stats?.avgEta ? `${stats.avgEta} ${t('common.minutes_short')}` : '—'} />
                <Stat label={t('home.live.avg_rating')} value={stats?.avgRating ? Number(stats.avgRating).toFixed(1) : '—'} />
                <Stat label={t('home.live.today_bookings')} value={stats?.todayBookings ?? '—'} />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-[var(--text-2)]">
                <span className="inline-flex items-center gap-1"><ShieldCheck size={14} className="text-[var(--success)]" /> {t('home.trust.verified')}</span>
                <span className="inline-flex items-center gap-1"><Clock size={14} className="text-[var(--warning)]" /> {t('home.trust.live_eta')}</span>
                <span className="inline-flex items-center gap-1"><Star size={14} className="text-[var(--primary)] fill-[var(--primary)]" /> {t('home.trust.real_reviews')}</span>
              </div>

              <button onClick={() => navigate('/search?urgent=1')} className="btn-dark w-full mt-5" data-testid="repair-quick-request">
                <Wrench size={16} /> {t('home.live.quick_request')}
              </button>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Helper components
// ══════════════════════════════════════════════════════════════════

function CoreCard({
  to, icon, kicker, title, desc, testId, primary,
}: { to: string; icon: React.ReactNode; kicker: string; title: string; desc: string; testId: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={`group rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${
        primary
          ? 'border-[var(--primary)] bg-[var(--primary-soft)] hover:shadow-[0_10px_30px_-10px_rgba(234,179,8,0.35)]'
          : 'border-[var(--border)] bg-white hover:border-[var(--primary)] shadow-[var(--shadow-card)]'
      }`}
      data-testid={testId}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`h-11 w-11 rounded-xl inline-flex items-center justify-center ${
            primary ? 'bg-[var(--primary)] text-black' : 'bg-[var(--primary-soft)] text-[var(--primary-h)]'
          }`}
        >
          {icon}
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-soft)]">{kicker}</span>
      </div>
      <h3 className="text-lg md:text-xl font-extrabold leading-tight">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text-2)]">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--text)] group-hover:text-[var(--primary-h)] transition-colors">
        <span>→</span>
      </div>
    </Link>
  );
}

function PackageCard({
  label, price, perks, highlight, badge, testId,
}: { label: string; price: string; perks: string[]; highlight?: boolean; badge?: string; testId: string }) {
  return (
    <div
      className={`relative rounded-2xl border p-6 ${
        highlight
          ? 'border-[var(--primary)] bg-white shadow-[0_14px_40px_-20px_rgba(234,179,8,0.45)]'
          : 'border-[var(--border)] bg-white shadow-[var(--shadow-card)]'
      }`}
      data-testid={testId}
    >
      {badge && (
        <span className="absolute -top-3 left-6 rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-bold text-black uppercase tracking-wider">
          {badge}
        </span>
      )}
      <div className="text-sm font-bold uppercase tracking-wider text-[var(--text-soft)]">{label}</div>
      <div className="mt-2 text-4xl font-extrabold">{price}</div>
      <ul className="mt-5 space-y-2 text-sm text-[var(--text-2)]">
        {perks.map((p, i) => (
          <li key={i} className="flex items-start gap-2">
            <ShieldCheck size={16} className="text-[var(--success)] mt-0.5 shrink-0" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] p-3.5">
      <div className="text-2xl font-extrabold text-[var(--text)]">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">{label}</div>
    </div>
  );
}

function Step({ n, title, text, icon }: { n: number; title: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-[var(--primary-soft)] text-[var(--primary-p)] inline-flex items-center justify-center font-extrabold">
          {n}
        </div>
        <div className="text-[var(--text-2)]">{icon}</div>
      </div>
      <h3 className="text-lg font-extrabold mb-1">{title}</h3>
      <p className="text-sm text-[var(--text-2)]">{text}</p>
    </div>
  );
}
