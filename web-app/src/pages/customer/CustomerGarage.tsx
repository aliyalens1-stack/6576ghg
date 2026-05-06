import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Plus, Trash2, Wrench, AlertCircle, ArrowRight } from 'lucide-react';
import { vehiclesAPI, customerIntelligenceAPI } from '../../services/api';

export default function CustomerGarage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [recs, setRecs]         = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm] = useState({ brand: '', model: '', year: '', plate: '', mileageKm: '' });

  const refresh = async () => {
    try {
      const [v, r] = await Promise.all([
        vehiclesAPI.getMy().catch(() => ({ data: [] })),
        customerIntelligenceAPI.getRecommendations().catch(() => ({ data: { recommendations: [] } })),
      ]);
      setVehicles(Array.isArray(v.data) ? v.data : (v.data?.items || []));
      setRecs(r.data?.recommendations || r.data?.items || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const addVehicle = async () => {
    if (!form.brand || !form.model) return;
    try {
      await vehiclesAPI.create({
        brand: form.brand, model: form.model, year: Number(form.year) || new Date().getFullYear(),
        plate: form.plate, mileageKm: Number(form.mileageKm) || 0,
      });
      setShowAdd(false);
      setForm({ brand: '', model: '', year: '', plate: '', mileageKm: '' });
      await refresh();
    } catch { alert('Не удалось добавить авто'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить авто из гаража?')) return;
    try { await vehiclesAPI.delete(id); setVehicles(p => p.filter(v => (v._id || v.id) !== id)); }
    catch { alert('Не удалось удалить'); }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-8 py-8" data-testid="customer-garage">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="slash-label mb-2">КАБИНЕТ КЛИЕНТА</div>
          <h1 className="font-display tracking-bebas text-4xl md:text-5xl">
            МОЙ <span className="text-amber">ГАРАЖ</span>
          </h1>
          <p className="text-xs mt-2" style={{ color: '#8A8A8A' }}>
            {vehicles.length} {vehicles.length === 1 ? 'авто' : 'авто'} · ускоряет создание запросов
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary btn-lg" data-testid="add-vehicle-btn">
          <Plus size={16} /> ДОБАВИТЬ АВТО
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Vehicles list */}
        <section className="space-y-3">
          {loading ? (
            <p className="text-sm" style={{ color: '#8A8A8A' }}>Загрузка…</p>
          ) : vehicles.length === 0 ? (
            <div className="card text-center py-16">
              <Car size={36} className="text-amber mx-auto mb-3" />
              <h3 className="font-display tracking-bebas text-2xl mb-1">ГАРАЖ ПУСТ</h3>
              <p className="mb-5" style={{ color: '#B8B8B8' }}>Добавьте свой автомобиль для быстрых запросов</p>
              <button onClick={() => setShowAdd(true)} className="btn-primary">Добавить авто</button>
            </div>
          ) : (
            vehicles.map(v => <VehicleRow key={v._id || v.id} v={v} onRemove={() => remove(v._id || v.id)} />)
          )}
        </section>

        {/* Recommendations sidebar */}
        <aside className="space-y-4">
          <div className="card-elevated">
            <div className="slash-label mb-3">РЕКОМЕНДАЦИИ</div>
            {recs.length === 0 ? (
              <p className="text-xs" style={{ color: '#8A8A8A' }}>Добавьте авто, чтобы получать персональные подсказки по обслуживанию.</p>
            ) : (
              <div className="space-y-2">
                {recs.slice(0, 6).map((r: any, i: number) => (
                  <div key={i} className="surface-chip !p-3" data-testid={`rec-${i}`}>
                    <div className="flex items-start gap-2.5">
                      <span className="icon-badge-soft !w-9 !h-9 shrink-0"><Wrench size={14} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{r.title || r.serviceName || 'Совет'}</div>
                        <p className="text-2xs mt-0.5" style={{ color: '#B8B8B8' }}>{r.description || r.subtitle || r.note || ''}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/search" className="btn-secondary w-full mt-4">Найти СТО для ТО</Link>
          </div>
        </aside>
      </div>

      {/* Add vehicle modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="modal-content w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="slash-label mb-2">НОВОЕ АВТО</div>
            <h3 className="font-display tracking-bebas text-3xl mb-5">ДОБАВИТЬ В ГАРАЖ</h3>
            <div className="space-y-3">
              <input className="input-shell w-full px-3 py-2 text-sm" placeholder="Марка (Toyota)"  value={form.brand}     onChange={e => setForm({ ...form, brand: e.target.value })} data-testid="add-vehicle-brand" />
              <input className="input-shell w-full px-3 py-2 text-sm" placeholder="Модель (Camry)"  value={form.model}     onChange={e => setForm({ ...form, model: e.target.value })} data-testid="add-vehicle-model" />
              <div className="grid grid-cols-2 gap-3">
                <input className="input-shell px-3 py-2 text-sm" placeholder="Год"   value={form.year}      onChange={e => setForm({ ...form, year: e.target.value })} />
                <input className="input-shell px-3 py-2 text-sm" placeholder="Номер" value={form.plate}     onChange={e => setForm({ ...form, plate: e.target.value })} />
              </div>
              <input className="input-shell w-full px-3 py-2 text-sm" placeholder="Пробег (км)" value={form.mileageKm} onChange={e => setForm({ ...form, mileageKm: e.target.value })} />
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Отмена</button>
              <button onClick={addVehicle} className="btn-primary flex-1" data-testid="add-vehicle-submit">Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleRow({ v, onRemove }: { v: any; onRemove: () => void }) {
  return (
    <div className="provider-card p-5 flex flex-col md:flex-row gap-4" data-testid={`vehicle-${v._id || v.id}`}>
      <div className="w-full md:w-32 h-28 surface-chip flex items-center justify-center shrink-0">
        <Car size={42} className="text-amber" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>
          {v.year || '—'} · {v.color || '—'}
        </div>
        <h3 className="font-display tracking-bebas text-2xl mt-0.5">{v.brand} {v.model}</h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: '#B8B8B8' }}>
          <span>{v.plate || '—'}</span>
          {v.mileageKm ? <span>· {v.mileageKm.toLocaleString('ru-UA')} км</span> : null}
          {v.vin ? <span>· VIN {String(v.vin).slice(-6)}</span> : null}
        </div>
        {v.mileageKm > 80000 && (
          <div className="mt-3 surface-chip !py-2 !px-3 inline-flex items-center gap-2 text-xs">
            <AlertCircle size={12} className="text-amber" />
            <span style={{ color: '#FFB020' }}>Скоро ТО · пробег {v.mileageKm} км</span>
          </div>
        )}
      </div>
      <div className="flex md:flex-col items-end justify-between gap-2 md:min-w-[160px]">
        <Link to={`/search?q=${encodeURIComponent(`${v.brand} ${v.model}`)}`} className="btn-primary btn-sm">
          Найти СТО <ArrowRight size={12} />
        </Link>
        <button onClick={onRemove} className="btn-secondary btn-sm" data-testid={`vehicle-remove-${v._id || v.id}`}>
          <Trash2 size={12} /> Удалить
        </button>
      </div>
    </div>
  );
}
