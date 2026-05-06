// Sprint 3 — Stripe / PayPal return handler. Polls status.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle, Package } from 'lucide-react';

const MAX_POLLS = 10;

export default function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const paymentId = params.get('paymentId') || '';
  const [state, setState] = useState<'polling' | 'paid' | 'failed'>('polling');
  const [payment, setPayment] = useState<any | null>(null);
  const pollRef = useRef(0);

  useEffect(() => {
    if (!paymentId) { setState('failed'); return; }
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/packages/status/${paymentId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPayment(data.payment);
        if (data.status === 'paid') { setState('paid'); return; }
        pollRef.current += 1;
        if (pollRef.current >= MAX_POLLS) { setState('failed'); return; }
        setTimeout(tick, 2000);
      } catch (e) { setState('failed'); }
    };
    tick();
  }, [paymentId]);

  return (
    <div className="mx-auto max-w-xl px-4 md:px-6 py-14" data-testid="payment-success-page">
      {state === 'polling' && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <Loader2 size={36} className="animate-spin mx-auto text-[var(--primary-h)] mb-4" />
          <h1 className="text-xl font-extrabold">Confirming payment…</h1>
          <p className="mt-2 text-sm text-[var(--text-2)]">This usually takes a few seconds.</p>
        </div>
      )}
      {state === 'paid' && payment && (
        <div className="rounded-2xl border border-green-300 bg-green-50 p-8 text-center" data-testid="payment-paid">
          <CheckCircle2 size={44} className="mx-auto text-green-600 mb-3" />
          <h1 className="text-2xl font-extrabold">Payment received ✓</h1>
          <p className="mt-2 text-[var(--text-2)]">
            +{payment.credits} inspection credit{payment.credits > 1 ? 's' : ''} added · €{payment.amount}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/selection-request" className="btn-primary" data-testid="payment-create-request-btn">
              <Package size={16} /> Create a request
            </Link>
            <Link to="/dashboard/requests" className="btn-dark">
              My requests
            </Link>
          </div>
        </div>
      )}
      {state === 'failed' && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-8 text-center" data-testid="payment-failed">
          <AlertCircle size={44} className="mx-auto text-red-600 mb-3" />
          <h1 className="text-xl font-extrabold">Payment not confirmed</h1>
          <p className="mt-2 text-sm text-[var(--text-2)]">We couldn't confirm your payment. If money was charged, credits will appear after sync.</p>
          <Link to="/packages" className="btn-primary mt-5 inline-flex">Retry</Link>
        </div>
      )}
    </div>
  );
}
