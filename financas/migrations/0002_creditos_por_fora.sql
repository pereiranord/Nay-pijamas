-- Só para quem JÁ rodou o schema.sql antigo (antes dos créditos por fora).
-- Instalação nova: o schema.sql já tem tudo, não rode este arquivo.
-- Rodar uma única vez: npm run db:migrate
ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'pluggy';
ALTER TABLE accounts ADD COLUMN closing_day INTEGER;
ALTER TABLE accounts ADD COLUMN due_day INTEGER;
ALTER TABLE accounts ADD COLUMN payment_pattern TEXT;
ALTER TABLE accounts ADD COLUMN notes TEXT;
ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'pluggy';
ALTER TABLE transactions ADD COLUMN group_id TEXT;
ALTER TABLE category_rules ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tx_group ON transactions(group_id);
