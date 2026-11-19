import { useState } from 'react';
import { AlertTriangle, Plus, Loader2, Mail } from 'lucide-react';
import { getDb } from '../services/db';
import type { EnvelopeStat } from '../services/financeEngine';

interface EnvelopeSectionProps {
  stats: EnvelopeStat[];
  onRefresh: () => void;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280'];

const fmt = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100';

export default function EnvelopeSection({ stats, onRefresh }: EnvelopeSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [limit, setLimit] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incomeStats = stats.filter((s) => s.envelope.type === 'income');
  const expenseStats = stats.filter((s) => s.envelope.type === 'expense');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Zarf adı girin.');
    const limitValue = type === 'expense' ? parseFloat(limit.replace(',', '.')) || 0 : 0;

    try {
      setSaving(true);
      const db = await getDb();
      await db.execute('INSERT INTO envelopes (name, type, monthly_limit, color) VALUES ($1, $2, $3, $4)', [
        name.trim(),
        type,
        limitValue,
        color,
      ]);
      setName('');
      setLimit('');
      setColor(COLORS[0]);
      setShowForm(false);
      onRefresh();
    } catch (err) {
      setError('Zarf eklenemedi: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Mail size={20} className="text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Zarflar</h2>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
        >
          <Plus size={16} />
          Yeni Zarf Ekle
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-2xl bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              className={inputCls}
              placeholder="Zarf adı"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
              <option value="expense">Gider</option>
              <option value="income">Gelir</option>
            </select>
            <input
              className={`${inputCls} disabled:opacity-50`}
              type="number"
              min="0"
              step="0.01"
              placeholder="Aylık limit (₺)"
              value={limit}
              disabled={type === 'income'}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-6 w-6 rounded-full transition ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400' : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Ekle
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      )}

      {stats.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">Henüz zarf yok. İlk zarfını ekleyerek başla.</p>
      )}

      {expenseStats.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-600">Gider</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {expenseStats.map((s) => {
              const pct = s.usagePercentage;
              const warn = pct >= 80;
              const over = pct >= 100;
              const barColor = over ? '#EF4444' : warn ? '#F97316' : s.envelope.color;
              return (
                <div key={s.envelope.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.envelope.color }} />
                      <span className="text-sm font-medium text-gray-900">{s.envelope.name}</span>
                    </div>
                    {warn && <AlertTriangle size={16} className={over ? 'text-red-500' : 'text-orange-500'} />}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                      {fmt(s.totalAmount)} / {s.monthlyLimit > 0 ? fmt(s.monthlyLimit) : 'Limitsiz'}
                    </span>
                    <span className={`font-semibold ${warn ? (over ? 'text-red-500' : 'text-orange-500') : 'text-gray-500'}`}>
                      %{Math.round(pct)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {incomeStats.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              Gelir
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {incomeStats.map((s) => (
              <div
                key={s.envelope.id}
                className="flex items-center justify-between rounded-2xl border border-gray-100 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.envelope.color }} />
                  <span className="text-sm font-medium text-gray-900">{s.envelope.name}</span>
                </div>
                <span className="text-sm font-semibold text-emerald-600">{fmt(s.totalAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}