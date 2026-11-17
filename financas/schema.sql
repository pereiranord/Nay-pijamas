-- Finanças pessoais via Open Finance (Pluggy / Meu Pluggy)
-- D1 schema. Rodar: wrangler d1 execute financas --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS meta (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id                 TEXT PRIMARY KEY,
  connector_name     TEXT,
  status             TEXT,
  execution_status   TEXT,
  consent_expires_at TEXT,
  last_updated_at    TEXT,
  synced_at          TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id                     TEXT PRIMARY KEY,
  item_id                TEXT,
  type                   TEXT,   -- BANK | CREDIT
  subtype                TEXT,   -- CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  name                   TEXT,
  marketing_name         TEXT,
  number                 TEXT,
  owner                  TEXT,
  currency_code          TEXT,
  balance                REAL,
  credit_limit           REAL,
  available_credit_limit REAL,
  balance_due_date       TEXT,
  minimum_payment        REAL,
  bank_name              TEXT,   -- rótulo definido por você (PLUGGY_ACCOUNT_LABELS)
  active                 INTEGER NOT NULL DEFAULT 1,
  raw                    TEXT,
  synced_at              TEXT,
  -- Créditos por fora (cartão de loja, Keeta, crediário...): contas que o Open Finance não enxerga
  source                 TEXT NOT NULL DEFAULT 'pluggy',  -- pluggy | manual
  closing_day            INTEGER,  -- dia do fechamento da fatura (manual)
  due_day                INTEGER,  -- dia do vencimento da fatura (manual)
  payment_pattern        TEXT,     -- como o pagamento aparece no extrato do banco
  notes                  TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL,
  item_id             TEXT,
  date                TEXT NOT NULL,          -- ISO8601 UTC, como vem da Pluggy
  day                 TEXT NOT NULL,          -- YYYY-MM-DD
  month               TEXT NOT NULL,          -- YYYY-MM
  description         TEXT,
  description_raw     TEXT,
  rkey                TEXT,                   -- chave normalizada p/ detectar recorrência
  amount              REAL NOT NULL,          -- valor cru da Pluggy, sem interpretação
  flow                REAL NOT NULL,          -- normalizado: negativo = saída, positivo = entrada
  direction           TEXT NOT NULL,          -- OUT | IN
  currency_code       TEXT,
  type                TEXT,                   -- DEBIT | CREDIT
  status              TEXT,                   -- PENDING | POSTED
  operation_type      TEXT,                   -- PIX, TED, BOLETO, PAGAMENTO_FATURA, ...
  pluggy_category     TEXT,                   -- null sem plano Pro
  merchant_name       TEXT,
  installment_number  INTEGER,
  total_installments  INTEGER,
  category            TEXT NOT NULL DEFAULT 'Sem categoria',
  category_source     TEXT NOT NULL DEFAULT 'fallback',  -- manual | rule | pluggy | fallback
  is_transfer         INTEGER NOT NULL DEFAULT 0,         -- 1 = movimentação interna, não é gasto
  raw                 TEXT,
  first_seen_at       TEXT,
  synced_at           TEXT,
  source              TEXT NOT NULL DEFAULT 'pluggy',     -- pluggy | manual
  group_id            TEXT                                -- agrupa as parcelas de uma compra manual
);

CREATE INDEX IF NOT EXISTS idx_tx_month    ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_tx_day      ON transactions(day);
CREATE INDEX IF NOT EXISTS idx_tx_account  ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_rkey     ON transactions(rkey);
CREATE INDEX IF NOT EXISTS idx_tx_expense  ON transactions(is_transfer, flow);
CREATE INDEX IF NOT EXISTS idx_tx_group    ON transactions(group_id);

CREATE TABLE IF NOT EXISTS category_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern     TEXT NOT NULL,
  match_type  TEXT NOT NULL DEFAULT 'contains',  -- contains | regex | operation_type
  category    TEXT NOT NULL,
  is_transfer INTEGER NOT NULL DEFAULT 0,
  priority    INTEGER NOT NULL DEFAULT 100,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT,
  account_id  TEXT              -- regra criada por um crédito manual (pagamento da fatura dele)
);

CREATE INDEX IF NOT EXISTS idx_rules_order ON category_rules(active, priority);

CREATE TABLE IF NOT EXISTS sync_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT,
  ended_at   TEXT,
  mode       TEXT,
  pages      INTEGER,
  upserted   INTEGER,
  ok         INTEGER,
  detail     TEXT
);
