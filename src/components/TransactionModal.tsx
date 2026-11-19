import { useEffect, useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { getDb } from '../services/db';
import { addIncome, addExpense } from '../services/financeEngine';
import type { Account, CreditCard, Envelope } from '../types/finance';

interface TransactionModalProps {
  isOpen: boolean;
  mode: 'income' | 'expense';
  onClose: () => void;
  onSuccess: () => void;
}

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-xs font-medium text-gray-500';

export default function TransactionModal({ isOpen, mode, onClose, onSuccess }: TransactionModalProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayStr());
  const [envelopeId, setEnvelopeId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [cardId, setCardId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card'>('cash');
  const [installmentCount, setInstallmentCount] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIncome = mode === 'income';

  useEffect(() => {
    if (!isOpen) return;
    setAmount('');
    setDescription('');
    setDate(todayStr());
    setEnvelopeId('');
    setAccountId('');
    setCardId('');
    setPaymentMethod('cash');
    setInstallmentCount(1);
    setError(null);

    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const [acc, crd, env] = await Promise.all([
          db.select<Account[]>('SELECT * FROM accounts ORDER BY name'),
          db.select<CreditCard[]>('SELECT * FROM credit_cards ORDER BY name'),
          db.select<Envelope[]>('SELECT * FROM envelopes ORDER BY name'),
        ]);
        if (cancelled) return;
        setAccounts(acc);
        setCards(crd);
        setEnvelopes(env);
        if (acc.length > 0) setAccountId(String(acc[0].id));
        if (crd.length > 0) setCardId(String(crd[0].id));
      } catch (e) {
        if (!cancelled) setError('Veriler yüklenemedi: ' + String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredEnvelopes = envelopes.filter((e) => e.type === mode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const value = parseFloat(amount.replace(',', '.'));
    if (!value || value <= 0) return setError('Geçerli bir tutar girin.');
    if (!description.trim()) return setError('Açıklama girin.');
    if (!date) return setError('Tarih seçin.');

    const envId = envelopeId ? Number(envelopeId) : null;

    try {
      setSubmitting(true);
      if (isIncome) {
        if (!accountId) return setError('Hedef hesap seçin.');
        await addIncome(value, description.trim(), date, envId, Number(accountId));
      } else if (paymentMethod === 'cash') {
        if (!accountId) return setError('Hesap seçin.');
        await addExpense(value, description.trim(), date, envId, 'cash', Number(accountId), null, 1);
      } else {
        if (!cardId) return setError('Kredi kartı seçin.');
        await addExpense(
          value,
          description.trim(),
          date,
          envId,
          'credit_card',
          null,
          Number(cardId),
          installmentCount,
        );
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError('İşlem kaydedilemedi: ' + String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                isIncome ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
              }`}
            >
              {isIncome ? <ArrowDownCircle size={22} /> : <ArrowUpCircle size={22} />}
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{isIncome ? 'Para Ekle' : 'Para Harca'}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Tutar (₺)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className={`${inputCls} text-lg font-semibold`}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>Açıklama</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isIncome ? 'Örn. Maaş' : 'Örn. Market alışverişi'}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tarih</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{isIncome ? 'Gelir Zarfı' : 'Gider Zarfı'}</label>
              <select value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)} className={inputCls}>
                <option value="">Zarfsız</option>
                {filteredEnvelopes.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isIncome ? (
            <div>
              <label className={labelCls}>Hedef Hesap</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
                {accounts.length === 0 && <option value="">Önce hesap ekleyin</option>}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type === 'checking' ? 'Vadesiz' : 'Birikim'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>Ödeme Yöntemi</label>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
                  {(
                    [
                      ['cash', 'Nakit / Hesap'],
                      ['credit_card', 'Kredi Kartı'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPaymentMethod(val)}
                      className={`rounded-lg py-2 text-sm font-medium transition ${
                        paymentMethod === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'cash' ? (
                <div>
                  <label className={labelCls}>Hesap</label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
                    {accounts.length === 0 && <option value="">Önce hesap ekleyin</option>}
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.type === 'checking' ? 'Vadesiz' : 'Birikim'})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Kart</label>
                    <select value={cardId} onChange={(e) => setCardId(e.target.value)} className={inputCls}>
                      {cards.length === 0 && <option value="">Önce kart ekleyin</option>}
                      {cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Taksit</label>
                    <select
                      value={installmentCount}
                      onChange={(e) => setInstallmentCount(Number(e.target.value))}
                      className={inputCls}
                    >
                      <option value={1}>Peşin</option>
                      {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                        <option key={n} value={n}>
                          {n} Taksit
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${
              isIncome ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
            }`}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {isIncome ? 'Geliri Kaydet' : 'Gideri Kaydet'}
          </button>
        </form>
      </div>
    </div>
  );
}