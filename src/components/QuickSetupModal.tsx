import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { getDb } from '../services/db';

interface QuickSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-xs font-medium text-gray-500';

export default function QuickSetupModal({ isOpen, onClose, onSuccess }: QuickSetupModalProps) {
  const [tab, setTab] = useState<'card' | 'account'>('card');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kart
  const [cardName, setCardName] = useState('');
  const [totalLimit, setTotalLimit] = useState('');
  const [currentDebt, setCurrentDebt] = useState('');
  const [statementDay, setStatementDay] = useState('1');
  const [dueDay, setDueDay] = useState('10');

  // Hesap
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<'checking' | 'savings'>('checking');
  const [balance, setBalance] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTab('card');
    setError(null);
    setCardName('');
    setTotalLimit('');
    setCurrentDebt('');
    setStatementDay('1');
    setDueDay('10');
    setAccName('');
    setAccType('checking');
    setBalance('');
  }, [isOpen]);

  if (!isOpen) return null;

  const num = (v: string) => parseFloat(v.replace(',', '.')) || 0;
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      const db = await getDb();

      if (tab === 'card') {
        if (!cardName.trim()) return setError('Kart adı girin.');
        if (num(totalLimit) <= 0) return setError('Geçerli bir limit girin.');
        await db.execute(
          'INSERT INTO credit_cards (name, total_limit, current_debt, statement_day, due_day) VALUES ($1, $2, $3, $4, $5)',
          [cardName.trim(), num(totalLimit), num(currentDebt), Number(statementDay), Number(dueDay)],
        );
      } else {
        if (!accName.trim()) return setError('Hesap adı girin.');
        await db.execute('INSERT INTO accounts (name, type, balance) VALUES ($1, $2, $3)', [
          accName.trim(),
          accType,
          num(balance),
        ]);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError('Kayıt eklenemedi: ' + String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Hesap / Kart Ekle</h2>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          {(
            [
              ['card', 'Kredi Kartı Ekle'],
              ['account', 'Hesap Ekle'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => {
                setTab(val);
                setError(null);
              }}
              className={`rounded-lg py-2 text-sm font-medium transition ${
                tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'card' ? (
            <>
              <div>
                <label className={labelCls}>Kart Adı</label>
                <input
                  className={inputCls}
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Örn. Garanti Bonus"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Toplam Limit (₺)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={totalLimit}
                    onChange={(e) => setTotalLimit(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Mevcut Borç (₺)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={currentDebt}
                    onChange={(e) => setCurrentDebt(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Hesap Kesim Günü</label>
                  <select className={inputCls} value={statementDay} onChange={(e) => setStatementDay(e.target.value)}>
                    {days.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Son Ödeme Günü</label>
                  <select className={inputCls} value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
                    {days.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={labelCls}>Hesap Adı</label>
                <input
                  className={inputCls}
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Örn. Maaş Hesabı"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tür</label>
                  <select
                    className={inputCls}
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as 'checking' | 'savings')}
                  >
                    <option value="checking">Vadesiz</option>
                    <option value="savings">Birikim</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Başlangıç Bakiyesi (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </>
          )}

          {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}