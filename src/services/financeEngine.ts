import type {
  Account,
  CreditCard,
  Envelope,
  Transaction,
  Installment,
  RecurringOrDebt,
} from "../types/finance";

import { getDb } from "./db";

export interface DashboardSummary {
  totalCash: number;
  totalSavings: number;
  totalDebt: number;
  monthlyIncome: number;
  monthlyExpense: number;
  netMonthly: number;
}

export interface EnvelopeStat {
  envelope: Envelope;
  totalAmount: number;
  monthlyLimit: number;
  usagePercentage: number;
}

export interface UpcomingReminder {
  id: string;
  title: string;
  amount: number;
  daysLeft: number;
  dueLabel: string;
}

// Verilen YYYY-MM ayının, taksit başlangıç tarihinden itibaren kaçıncı ay olduğunu hesaplar (0 = ilk ay)
function getMonthDiff(startYYYYMM: string, targetYYYYMM: string): number {
  const [sy, sm] = startYYYYMM.split("-").map(Number);
  const [ty, tm] = targetYYYYMM.split("-").map(Number);
  return (ty - sy) * 12 + (tm - sm);
}

// Belirli bir ayda aktif olan taksitlerin aylık tutarlarını döndürür
async function getActiveInstallmentsForMonth(monthYYYYMM: string): Promise<Installment[]> {
  const db = await getDb();
  const all = await db.select<Installment[]>("SELECT * FROM installments");
  return all.filter((inst) => {
    const diff = getMonthDiff(inst.start_date.slice(0, 7), monthYYYYMM);
    return diff >= 0 && diff < inst.installment_count;
  });
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const db = await getDb();

  const accounts = await db.select<Account[]>("SELECT * FROM accounts");
  const cards = await db.select<CreditCard[]>("SELECT * FROM credit_cards");
  const personalDebts = await db.select<RecurringOrDebt[]>(
    `SELECT * FROM recurring_and_debts
     WHERE category = 'personal_debt'
     AND is_paid_this_month = 0`
  );

  const currentMonth = new Date().toISOString().slice(0, 7);

  const monthlyTransactions = await db.select<Transaction[]>(
    `SELECT * FROM transactions
     WHERE substr(date, 1, 7) = ?`,
    [currentMonth]
  );

  const activeInstallments = await getActiveInstallmentsForMonth(currentMonth);

  const totalCash = accounts
    .filter((account) => account.type === "checking")
    .reduce((sum, account) => sum + account.balance, 0);

  const totalSavings = accounts
    .filter((account) => account.type === "savings")
    .reduce((sum, account) => sum + account.balance, 0);

  const totalDebt =
    cards.reduce((sum, card) => sum + card.current_debt, 0) +
    personalDebts.reduce((sum, debt) => sum + debt.amount, 0);

  const monthlyIncome = monthlyTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const txExpense = monthlyTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const installmentExpense = activeInstallments.reduce(
    (sum, inst) => sum + inst.monthly_amount,
    0
  );

  const monthlyExpense = txExpense + installmentExpense;

  return {
    totalCash,
    totalSavings,
    totalDebt,
    monthlyIncome,
    monthlyExpense,
    netMonthly: monthlyIncome - monthlyExpense,
  };
}

export async function getUpcomingReminders(): Promise<UpcomingReminder[]> {
  const db = await getDb();
  const reminders: UpcomingReminder[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Kredi Kartı Son Ödeme Tarihleri (Borcu > 0 olanlar)
  const cards = await db.select<CreditCard[]>("SELECT * FROM credit_cards WHERE current_debt > 0");
  for (const card of cards) {
    let targetDate = new Date(today.getFullYear(), today.getMonth(), card.due_day);
    if (targetDate < today) {
      targetDate = new Date(today.getFullYear(), today.getMonth() + 1, card.due_day);
    }
    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 5) {
      reminders.push({
        id: `card-${card.id}`,
        title: `${card.name} Son Ödeme`,
        amount: card.current_debt,
        daysLeft: diffDays,
        dueLabel: diffDays === 0 ? "Bugün!" : `${diffDays} gün kaldı`,
      });
    }
  }

  // 2. Bireysel Borç Son Tarihleri
  const debts = await db.select<RecurringOrDebt[]>(
    "SELECT * FROM recurring_and_debts WHERE category = 'personal_debt' AND is_paid_this_month = 0 AND specific_date IS NOT NULL"
  );
  for (const debt of debts) {
    if (!debt.specific_date) continue;
    const targetDate = new Date(debt.specific_date + "T00:00:00");
    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 5) {
      reminders.push({
        id: `debt-${debt.id}`,
        title: debt.title,
        amount: debt.amount,
        daysLeft: diffDays,
        dueLabel: diffDays < 0 ? `${Math.abs(diffDays)} gün gecikti!` : diffDays === 0 ? "Bugün!" : `${diffDays} gün kaldı`,
      });
    }
  }

  return reminders.sort((a, b) => a.daysLeft - b.daysLeft);
}

export async function addIncome(
  amount: number,
  description: string,
  date: string,
  envelopeId: number | null,
  accountId: number
): Promise<void> {
  const db = await getDb();

  await db.execute(
    `INSERT INTO transactions
     (type, amount, description, date, envelope_id,
      payment_method, account_id, card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["income", amount, description, date, envelopeId, "cash", accountId, null]
  );

  await db.execute(
    "UPDATE accounts SET balance = balance + ? WHERE id = ?",
    [amount, accountId]
  );
}

export async function addExpense(
  amount: number,
  description: string,
  date: string,
  envelopeId: number | null,
  paymentMethod: "cash" | "credit_card",
  accountId: number | null,
  cardId: number | null,
  installmentCount: number = 1
): Promise<void> {
  const db = await getDb();

  if (amount <= 0) {
    throw new Error("Harcama tutarı sıfırdan büyük olmalıdır.");
  }

  if (paymentMethod === "cash") {
    if (accountId === null) {
      throw new Error("Nakit harcama için hesap seçilmelidir.");
    }

    const accounts = await db.select<Account[]>(
      "SELECT * FROM accounts WHERE id = ?",
      [accountId]
    );
    if (accounts.length === 0) throw new Error("Hesap bulunamadı.");
    if (accounts[0].balance < amount) {
      throw new Error(`Yetersiz bakiye! Mevcut bakiye: ₺${accounts[0].balance.toLocaleString("tr-TR")}`);
    }

    await db.execute(
      `INSERT INTO transactions
       (type, amount, description, date, envelope_id,
        payment_method, account_id, card_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["expense", amount, description, date, envelopeId, "cash", accountId, null]
    );

    await db.execute(
      "UPDATE accounts SET balance = balance - ? WHERE id = ?",
      [amount, accountId]
    );
  } else {
    if (cardId === null) {
      throw new Error("Kredi kartı seçilmelidir.");
    }

    if (installmentCount <= 1) {
      await db.execute(
        `INSERT INTO transactions
         (type, amount, description, date, envelope_id,
          payment_method, account_id, card_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ["expense", amount, description, date, envelopeId, "credit_card", null, cardId]
      );

      await db.execute(
        "UPDATE credit_cards SET current_debt = current_debt + ? WHERE id = ?",
        [amount, cardId]
      );
    } else {
      await db.execute(
        `INSERT INTO installments
         (card_id, envelope_id, description, total_amount,
          installment_count, paid_count, monthly_amount, start_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cardId, envelopeId, description, amount, installmentCount, 0, amount / installmentCount, date]
      );

      await db.execute(
        "UPDATE credit_cards SET current_debt = current_debt + ? WHERE id = ?",
        [amount, cardId]
      );
    }
  }
}

export async function payCreditCard(
  cardId: number,
  accountId: number,
  amount: number,
  date: string
): Promise<void> {
  const db = await getDb();

  if (amount <= 0) throw new Error("Ödeme tutarı sıfırdan büyük olmalıdır.");

  const cards = await db.select<CreditCard[]>("SELECT * FROM credit_cards WHERE id = ?", [cardId]);
  if (cards.length === 0) throw new Error("Kredi kartı bulunamadı.");

  const accounts = await db.select<Account[]>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (accounts.length === 0) throw new Error("Hesap bulunamadı.");

  if (accounts[0].balance < amount) {
    throw new Error("Hesap bakiyesi yetersiz (hesap eksiye düşemez).");
  }

  if (cards[0].current_debt < amount) {
    throw new Error("Ödeme tutarı mevcut kart borcundan fazla olamaz.");
  }

  await db.execute(
    `INSERT INTO transactions
     (type, amount, description, date, envelope_id,
      payment_method, account_id, card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["card_payment", amount, `${cards[0].name} borç ödemesi`, date, null, "cash", accountId, cardId]
  );

  await db.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, accountId]);
  await db.execute("UPDATE credit_cards SET current_debt = current_debt - ? WHERE id = ?", [amount, cardId]);
}

export async function payPersonalDebt(
  debtId: number,
  accountId: number,
  amount: number,
  date: string
): Promise<void> {
  const db = await getDb();

  if (amount <= 0) throw new Error("Ödeme tutarı sıfırdan büyük olmalıdır.");

  const debts = await db.select<RecurringOrDebt[]>("SELECT * FROM recurring_and_debts WHERE id = ?", [debtId]);
  if (debts.length === 0) throw new Error("Borç kaydı bulunamadı.");

  const accounts = await db.select<Account[]>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (accounts.length === 0) throw new Error("Hesap bulunamadı.");

  if (accounts[0].balance < amount) {
    throw new Error("Hesap bakiyesi yetersiz (hesap eksiye düşemez).");
  }

  if (debts[0].amount < amount) {
    throw new Error("Ödeme tutarı kalan borçtan fazla olamaz.");
  }

  const remainingDebt = debts[0].amount - amount;

  await db.execute(
    `INSERT INTO transactions
     (type, amount, description, date, envelope_id,
      payment_method, account_id, card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["expense", amount, `${debts[0].title} (Borç Ödemesi)`, date, debts[0].envelope_id, "cash", accountId, null]
  );

  await db.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, accountId]);

  if (remainingDebt <= 0) {
    await db.execute("UPDATE recurring_and_debts SET amount = 0, is_paid_this_month = 1 WHERE id = ?", [debtId]);
  } else {
    await db.execute("UPDATE recurring_and_debts SET amount = ? WHERE id = ?", [remainingDebt, debtId]);
  }
}

export async function getEnvelopeStats(monthYYYYMM: string): Promise<EnvelopeStat[]> {
  const db = await getDb();

  const envelopes = await db.select<Envelope[]>("SELECT * FROM envelopes");
  const transactions = await db.select<Transaction[]>(
    `SELECT * FROM transactions
     WHERE substr(date, 1, 7) = ?
     AND type IN ('income', 'expense')`,
    [monthYYYYMM]
  );
  const activeInstallments = await getActiveInstallmentsForMonth(monthYYYYMM);

  return envelopes.map((envelope) => {
    const matchingTransactions = transactions.filter(
      (transaction) =>
        transaction.envelope_id === envelope.id &&
        transaction.type === envelope.type
    );

    const txTotal = matchingTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );

    const instTotal =
      envelope.type === "expense"
        ? activeInstallments
            .filter((inst) => inst.envelope_id === envelope.id)
            .reduce((sum, inst) => sum + inst.monthly_amount, 0)
        : 0;

    const totalAmount = txTotal + instTotal;
    const monthlyLimit = envelope.type === "expense" ? envelope.monthly_limit : 0;
    const usagePercentage =
      envelope.type === "expense" && monthlyLimit > 0
        ? (totalAmount / monthlyLimit) * 100
        : 0;

    return {
      envelope,
      totalAmount,
      monthlyLimit,
      usagePercentage,
    };
  });
}