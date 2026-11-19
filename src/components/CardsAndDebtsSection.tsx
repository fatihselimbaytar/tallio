import { useEffect, useState } from 'react';
import { CreditCard as CardIcon, HandCoins, Plus, CheckCircle2, Trash2 } from 'lucide-react';
import { getDb } from '../services/db';
import { payCreditCard, payPersonalDebt } from '../services/financeEngine';
import type { Account, CreditCard, RecurringOrDebt } from '../types/finance';

const fmt = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);

interface Props {
  onRefresh: () => void;
}

export default function CardsAndDebtsSection({ onRefresh }: Props) {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [debts, setDebts] = useState<RecurringOrDebt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Kısmi / Tam Ödeme Durumu
  const [payingTarget, setPayingTarget] = useState<{
    kind: 'card' | 'debt';
    id: number;
    title: string;
    maxAmount: number;
  } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState<number>(0);

  // Yeni Bireysel Borç Ekleme
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [debtTitle, setDebtTitle] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDate, setDebtDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    const db = await getDb();
    const [cList, dList, aList] = await Promise.all([
      db.select<CreditCard[]>('SELECT * FROM credit_cards ORDER BY id'),
      db.select<RecurringOrDebt[]>(
        "SELECT * FROM recurring_and_debts WHERE category = 'personal_debt' AND is_paid_this_month = 0 ORDER BY id DESC"
      ),
      db.select<Account[]>('SELECT * FROM accounts ORDER BY id'),
    ]);
    setCards(cList);
    setDebts(dList);
    setAccounts(aList);
    if (aList.length > 0) setPayAccountId(aList[0].id);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openPayBox = (kind: 'card' | 'debt', id: number, title: string, maxAmount: number) => {
    setError(null);
    setPayingTarget({ kind, id, title, maxAmount });
    setPayAmount(String(maxAmount)); // Varsayılan tam tutar gelir ama kullanıcı istediği rakamı yazabilir
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingTarget) return;
    setError(null);

    const val = parseFloat(payAmount);
    if (!val || val <= 0) return setError('Geçerli bir ödeme tutarı girin.');

    const today = new Date().toISOString().slice(0, 10);

    try {
      if (payingTarget.kind === 'card') {
        await payCreditCard(payingTarget.id, payAccountId, val, today);
      } else {
        await payPersonalDebt(payingTarget.id, payAccountId, val, today);
      }
      setPayingTarget(null);
      setPayAmount('');
      await loadAll();
      onRefresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(debtAmount);
    if (!debtTitle.trim() || !val || val <= 0) return;

    const db = await getDb();
    await db.execute(
      `INSERT INTO recurring_and_debts (title, category, amount, specific_date, is_paid_this_month)
       VALUES (?, 'personal_debt', ?, ?, 0)`,
      [debtTitle.trim(), val, debtDate || null]
    );

    setDebtTitle('');
    setDebtAmount('');
    setDebtDate('');
    setShowDebtForm(false);
    await loadAll();
    onRefresh();
  };

  const handleDeleteCard = async (id: number) => {
    const db = await getDb();
    await db.execute('DELETE FROM credit_cards WHERE id = ?', [id]);
    await loadAll();
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Ödeme Kutusu (Kısmi veya Tam) */}
      {payingTarget && (
        <form onSubmit={handlePaySubmit} className="rounded-3xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-950">
              {payingTarget.title} — Borç Ödemesi (Kalan Borç: {fmt(payingTarget.maxAmount)})
            </h3>
            <button
              type="button"
              onClick={() => setPayingTarget(null)}
              className="text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              İptal
            </button>
          </div>

          {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">Ödenecek Tutar (İstediğiniz tutarı yazın)</label>
              <input
                type="number"
                step="0.01"
                max={payingTarget.maxAmount}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Ödeme Yapılacak Hesap</label>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({fmt(acc.balance)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Ödemeyi Onayla
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Kredi Kartları */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-4 text-lg font-semibold">Kredi Kartları</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-gray-400">Henüz kayıtlı kredi kartı yok. Sağ üstten ekleyebilirsiniz.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {cards.map((card) => {
              const remainingLimit = card.total_limit - card.current_debt;
              return (
                <div key={card.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                        <CardIcon size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{card.name}</h3>
                        <p className="text-xs text-gray-400">
                          Kesim: Her ayın {card.statement_day}&apos;i · Son Ödeme: {card.due_day}&apos;i
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteCard(card.id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-100 hover:text-rose-600"
                      title="Kartı Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="my-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-3 text-xs">
                    <div>
                      <span className="text-gray-400">Güncel Borç</span>
                      <p className="mt-0.5 text-base font-semibold text-rose-600">{fmt(card.current_debt)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Kalan Limit</span>
                      <p className="mt-0.5 text-base font-semibold text-emerald-600">{fmt(remainingLimit)}</p>
                    </div>
                  </div>

                  {card.current_debt > 0 && (
                    <button
                      onClick={() => openPayBox('card', card.id, card.name, card.current_debt)}
                      className="w-full rounded-xl bg-gray-900 py-2 text-xs font-semibold text-white transition hover:bg-gray-800"
                    >
                      Borç Öde (Kısmi / Tam)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bireysel Borçlar */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bireysel Borçlar</h2>
          <button
            onClick={() => setShowDebtForm(!showDebtForm)}
            className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            <Plus size={14} />
            Borç Ekle
          </button>
        </div>

        {showDebtForm && (
          <form onSubmit={handleAddDebt} className="mb-4 grid grid-cols-1 gap-3 rounded-2xl bg-gray-50 p-4 sm:grid-cols-4">
            <input
              type="text"
              placeholder="Kime / Açıklama (Örn: Ahmet'e Borç)"
              value={debtTitle}
              onChange={(e) => setDebtTitle(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Toplam Borç Tutarı (₺)"
              value={debtAmount}
              onChange={(e) => setDebtAmount(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              required
            />
            <input
              type="date"
              value={debtDate}
              onChange={(e) => setDebtDate(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              Kaydet
            </button>
          </form>
        )}

        {debts.length === 0 ? (
          <p className="text-sm text-gray-400">Aktif bireysel borcunuz bulunmuyor.</p>
        ) : (
          <div className="space-y-2.5">
            {debts.map((debt) => (
              <div
                key={debt.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <HandCoins size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{debt.title}</p>
                    {debt.specific_date && (
                      <p className="text-xs text-gray-400">Son Tarih: {debt.specific_date}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-sm font-semibold text-rose-600">{fmt(debt.amount)}</span>
                  <button
                    onClick={() => openPayBox('debt', debt.id, debt.title, debt.amount)}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <CheckCircle2 size={14} />
                    Ödeme Yap
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}