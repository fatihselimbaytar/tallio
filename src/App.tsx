import { useCallback, useEffect, useRef, useState } from 'react';
import { Wallet, PiggyBank, CreditCard as CardIcon, Plus, Minus, Settings2, TrendingUp, TrendingDown, Loader2, BellRing } from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { initDatabase } from './services/db';
import { getDashboardSummary, getEnvelopeStats, getUpcomingReminders } from './services/financeEngine';
import type { DashboardSummary, EnvelopeStat, UpcomingReminder } from './services/financeEngine';
import TransactionModal from './components/TransactionModal';
import EnvelopeSection from './components/EnvelopeSection';
import QuickSetupModal from './components/QuickSetupModal';
import AccountsSection from './components/AccountsSection';
import CardsAndDebtsSection from './components/CardsAndDebtsSection';

const fmt = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);

const currentMonthYYYYMM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const emptySummary: DashboardSummary = {
  totalCash: 0,
  totalSavings: 0,
  totalDebt: 0,
  monthlyIncome: 0,
  monthlyExpense: 0,
  netMonthly: 0,
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [envelopeStats, setEnvelopeStats] = useState<EnvelopeStat[]>([]);
  const [reminders, setReminders] = useState<UpcomingReminder[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const notifiedOnce = useRef(false);

  const [txOpen, setTxOpen] = useState(false);
  const [txMode, setTxMode] = useState<'income' | 'expense'>('income');
  const [setupOpen, setSetupOpen] = useState(false);

  const triggerMacNotifications = async (items: UpcomingReminder[]) => {
    if (items.length === 0 || notifiedOnce.current) return;
    notifiedOnce.current = true;

    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === 'granted';
      }
      if (granted) {
        const first = items[0];
        sendNotification({
          title: 'Yaklaşan Ödeme Hatırlatıcısı',
          body: `${first.title} (${fmt(first.amount)}) - ${first.dueLabel}${items.length > 1 ? ` (+${items.length - 1} ödeme daha)` : ''}`,
        });
      }
    } catch {
      // Geliştirme ortamında bildirim izni verilmezse sessizce geç
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [s, e, r] = await Promise.all([
        getDashboardSummary(),
        getEnvelopeStats(currentMonthYYYYMM()),
        getUpcomingReminders(),
      ]);
      setSummary(s);
      setEnvelopeStats(e);
      setReminders(r);
      setRefreshKey((k) => k + 1);
      setError(null);
      await triggerMacNotifications(r);
    } catch (err) {
      setError('Veriler yüklenemedi: ' + String(err));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await loadData();
      } catch (err) {
        setError('Veritabanı başlatılamadı: ' + String(err));
      } finally {
        setReady(true);
      }
    })();
  }, [loadData]);

  const openTx = (mode: 'income' | 'expense') => {
    setTxMode(mode);
    setTxOpen(true);
  };

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  const positive = summary.netMonthly >= 0;
  const monthLabel = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  const topCards = [
    { label: 'Toplam Para', value: summary.totalCash, icon: Wallet, tint: 'bg-blue-100 text-blue-600' },
    { label: 'Birikim', value: summary.totalSavings, icon: PiggyBank, tint: 'bg-emerald-100 text-emerald-600' },
    { label: 'Toplam Borç', value: summary.totalDebt, icon: CardIcon, tint: 'bg-rose-100 text-rose-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bütçem</h1>
            <p className="text-sm capitalize text-gray-400">{monthLabel}</p>
          </div>
          <button
            onClick={() => setSetupOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-black/5 transition hover:bg-gray-100"
          >
            <Settings2 size={16} />
            Hesap / Kart Ekle
          </button>
        </header>

        {/* Yaklaşan Ödeme Uyarı Şeridi */}
        {reminders.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <BellRing size={17} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-950">Yaklaşan Ödemeleriniz Var</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {reminders.map((rem) => (
                    <span
                      key={rem.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-xs ring-1 ring-amber-200/70"
                    >
                      <span>{rem.title}:</span>
                      <strong>{fmt(rem.amount)}</strong>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        {rem.dueLabel}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {topCards.map(({ label, value, icon: Icon, tint }) => (
            <div key={label} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${tint}`}>
                <Icon size={20} />
              </div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{fmt(value)}</p>
            </div>
          ))}

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">Bu Ayın Net Durumu</p>
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  positive ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                }`}
              >
                {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {positive ? 'Artıda' : 'Ekside'}
              </span>
            </div>
            <p className={`text-2xl font-semibold tracking-tight ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
              {fmt(summary.netMonthly)}
            </p>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Gelir</span>
                <span className="font-medium text-emerald-600">{fmt(summary.monthlyIncome)}</span>
              </div>
              <div className="flex justify-between">
                <span>Gider</span>
                <span className="font-medium text-rose-600">{fmt(summary.monthlyExpense)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-center gap-4 sm:flex-row">
          <button
            onClick={() => openTx('income')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99]"
          >
            <Plus size={20} />
            Para Ekle
          </button>
          <button
            onClick={() => openTx('expense')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-rose-600 active:scale-[0.99]"
          >
            <Minus size={20} />
            Para Harca
          </button>
        </div>

        <AccountsSection key={`acc-${refreshKey}`} onRefresh={loadData} />
        <EnvelopeSection stats={envelopeStats} onRefresh={loadData} />
        <CardsAndDebtsSection key={`card-${refreshKey}`} onRefresh={loadData} />
      </div>

      <TransactionModal
        isOpen={txOpen}
        mode={txMode}
        onClose={() => setTxOpen(false)}
        onSuccess={loadData}
      />
      <QuickSetupModal isOpen={setupOpen} onClose={() => setSetupOpen(false)} onSuccess={loadData} />
    </div>
  );
}