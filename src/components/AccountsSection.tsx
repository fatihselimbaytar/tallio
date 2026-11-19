import { useEffect, useState } from 'react';
import { Wallet, PiggyBank, ArrowRightLeft, Trash2, AlertTriangle } from 'lucide-react';
import { getDb } from '../services/db';
import type { Account } from '../types/finance';

const fmt = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);

interface Props {
  onRefresh: () => void;
}

export default function AccountsSection({ onRefresh }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [fromId, setFromId] = useState<number>(0);
  const [toId, setToId] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async () => {
    const db = await getDb();
    const list = await db.select<Account[]>('SELECT * FROM accounts ORDER BY type, id');
    setAccounts(list);
    if (list.length >= 2) {
      setFromId(list[0].id);
      setToId(list[1].id);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const val = parseFloat(amount);
    if (!val || val <= 0) return setError('Geçerli bir tutar girin.');
    if (fromId === toId) return setError('Kaynak ve hedef hesap aynı olamaz.');

    const source = accounts.find((a) => a.id === fromId);
    if (!source || source.balance < val) {
      return setError('Kaynak hesapta yeterli bakiye yok (hesap eksiye düşemez).');
    }

    const db = await getDb();
    await db.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [val, fromId]);
    await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [val, toId]);

    setAmount('');
    setShowTransfer(false);
    await loadAccounts();
    onRefresh();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const db = await getDb();
    await db.execute('DELETE FROM accounts WHERE id = ?', [confirmDelete.id]);
    setConfirmDelete(null);
    await loadAccounts();
    onRefresh();
  };

  const checking = accounts.filter((a) => a.type === 'checking');
  const savings = accounts.filter((a) => a.type === 'savings');

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hesaplar & Birikimler</h2>
        {accounts.length >= 2 && (
          <button
            onClick={() => {
              setShowTransfer(!showTransfer);
              setError(null);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
          >
            <ArrowRightLeft size={14} />
            Hesaplar Arası Transfer
          </button>
        )}
      </div>

      {showTransfer && (
        <form onSubmit={handleTransfer} className="mb-5 rounded-2xl bg-gray-50 p-4 space-y-3">
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={fromId}
              onChange={(e) => setFromId(Number(e.target.value))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  Çıkış: {a.name} ({fmt(a.balance)})
                </option>
              ))}
            </select>
            <select
              value={toId}
              onChange={(e) => setToId(Number(e.target.value))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  Giriş: {a.name} ({fmt(a.balance)})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Tutar (₺)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Aktar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Silme Onay Penceresi */}
      {confirmDelete && (
        <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-sm text-rose-800">
            <AlertTriangle size={18} className="shrink-0 text-rose-600" />
            <span>
              <strong>{confirmDelete.name}</strong> ({fmt(confirmDelete.balance)}) hesabını silmek istediğinize emin misiniz?
            </span>
          </div>
          <div className="flex gap-2 self-end sm:self-auto">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              Vazgeç
            </button>
            <button
              onClick={handleDelete}
              className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
            >
              Evet, Sil
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Vadesiz Hesaplar */}
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Vadesiz / Nakit Hesaplar
          </p>
          <div className="space-y-2.5">
            {checking.length === 0 && <p className="text-sm text-gray-400">Vadesiz hesap yok.</p>}
            {checking.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <Wallet size={17} />
                  </div>
                  <span className="text-sm font-medium text-gray-800">{acc.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{fmt(acc.balance)}</span>
                  <button
                    onClick={() => setConfirmDelete(acc)}
                    title="Hesabı Sil"
                    className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-100 hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Birikim Hesapları */}
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Birikim Hesapları
          </p>
          <div className="space-y-2.5">
            {savings.length === 0 && <p className="text-sm text-gray-400">Birikim hesabı yok.</p>}
            {savings.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <PiggyBank size={17} />
                  </div>
                  <span className="text-sm font-medium text-gray-800">{acc.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-emerald-700">{fmt(acc.balance)}</span>
                  <button
                    onClick={() => setConfirmDelete(acc)}
                    title="Hesabı Sil"
                    className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-100 hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}