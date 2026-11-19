export interface Account {
  id: number;
  name: string;
  type: 'checking' | 'savings';
  balance: number;
}

export interface CreditCard {
  id: number;
  name: string;
  total_limit: number;
  current_debt: number;
  statement_day: number;
  due_day: number;
}

export interface Envelope {
  id: number;
  name: string;
  type: 'income' | 'expense';
  monthly_limit: number;
  color: string;
}

export interface Transaction {
  id: number;
  type: 'income' | 'expense' | 'card_payment';
  amount: number;
  description: string;
  date: string;
  envelope_id: number | null;
  payment_method: 'cash' | 'credit_card';
  account_id: number | null;
  card_id: number | null;
}

export interface Installment {
  id: number;
  card_id: number;
  envelope_id: number | null;
  description: string;
  total_amount: number;
  installment_count: number;
  paid_count: number;
  monthly_amount: number;
  start_date: string;
}

export interface RecurringOrDebt {
  id: number;
  title: string;
  category: 'recurring_income' | 'recurring_expense' | 'personal_debt';
  amount: number;
  due_day: number | null;
  specific_date: string | null;
  envelope_id: number | null;
  is_paid_this_month: number;
}