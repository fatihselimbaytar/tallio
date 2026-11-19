import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:butce.db');
  }
  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0.0
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS credit_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      total_limit REAL NOT NULL,
      current_debt REAL NOT NULL DEFAULT 0.0,
      statement_day INTEGER NOT NULL,
      due_day INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS envelopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      monthly_limit REAL DEFAULT 0.0,
      color TEXT DEFAULT '#3B82F6'
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      envelope_id INTEGER,
      payment_method TEXT NOT NULL,
      account_id INTEGER,
      card_id INTEGER
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      envelope_id INTEGER,
      description TEXT NOT NULL,
      total_amount REAL NOT NULL,
      installment_count INTEGER NOT NULL,
      paid_count INTEGER NOT NULL DEFAULT 0,
      monthly_amount REAL NOT NULL,
      start_date TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recurring_and_debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER,
      specific_date TEXT,
      envelope_id INTEGER,
      is_paid_this_month INTEGER DEFAULT 0
    );
  `);

  const existingAccounts = await db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM accounts');
  if (existingAccounts[0].count === 0) {
    await db.execute("INSERT INTO accounts (name, type, balance) VALUES ('Ana Nakit / Hesap', 'checking', 0)");
    await db.execute("INSERT INTO accounts (name, type, balance) VALUES ('Birikim Hesabı', 'savings', 0)");
  }
}