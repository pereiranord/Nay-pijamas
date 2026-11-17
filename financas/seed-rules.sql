-- Regras iniciais de categorização e de movimentação interna.
-- Rodar depois do schema: wrangler d1 execute financas --file=./seed-rules.sql --remote
-- Os padrões são comparados sem acento e em minúsculas, contra descricao + descricao crua + merchant.
-- priority menor = avaliada antes. A primeira que casar vence.

-- Preserva as regras criadas pelos creditos por fora (account_id preenchido).
DELETE FROM category_rules WHERE account_id IS NULL;

-- 1. Movimentação interna (is_transfer = 1): sai de uma conta sua e entra em outra.
--    Precisa ficar fora dos gastos, senão o mesmo dinheiro conta duas vezes.
INSERT INTO category_rules (pattern, match_type, category, is_transfer, priority, created_at) VALUES
  ('PAGAMENTO_FATURA',          'operation_type', 'Pagamento de fatura',  1, 10, datetime('now')),
  ('pagamento de fatura',       'contains',       'Pagamento de fatura',  1, 11, datetime('now')),
  ('pagto fatura',              'contains',       'Pagamento de fatura',  1, 11, datetime('now')),
  ('pagamento fatura',          'contains',       'Pagamento de fatura',  1, 11, datetime('now')),
  ('fatura cartao',             'contains',       'Pagamento de fatura',  1, 11, datetime('now')),
  ('pagamento de cartao',       'contains',       'Pagamento de fatura',  1, 11, datetime('now')),
  ('aplicacao',                 'contains',       'Investimento',         1, 12, datetime('now')),
  ('resgate',                   'contains',       'Investimento',         1, 12, datetime('now')),
  ('cdb',                       'contains',       'Investimento',         1, 12, datetime('now')),
  ('tesouro direto',            'contains',       'Investimento',         1, 12, datetime('now')),
  ('poupanca',                  'contains',       'Investimento',         1, 12, datetime('now')),
  ('rendimento',                'contains',       'Investimento',         1, 12, datetime('now')),
  ('transferencia entre contas','contains',       'Transferencia interna',1, 13, datetime('now')),
  ('mesma titularidade',        'contains',       'Transferencia interna',1, 13, datetime('now')),
  ('estorno',                   'contains',       'Estorno',              1, 14, datetime('now'));

-- 2. Receitas
INSERT INTO category_rules (pattern, match_type, category, is_transfer, priority, created_at) VALUES
  ('salario',      'contains', 'Salario',   0, 20, datetime('now')),
  ('pro labore',   'contains', 'Salario',   0, 20, datetime('now')),
  ('prolabore',    'contains', 'Salario',   0, 20, datetime('now'));

-- 3. Gastos. Ajuste e acrescente pelo painel conforme for vendo seus extratos.
INSERT INTO category_rules (pattern, match_type, category, is_transfer, priority, created_at) VALUES
  ('ifood',            'contains', 'Delivery',        0, 40, datetime('now')),
  ('rappi',            'contains', 'Delivery',        0, 40, datetime('now')),
  ('uber eats',        'contains', 'Delivery',        0, 40, datetime('now')),
  ('99food',           'contains', 'Delivery',        0, 40, datetime('now')),
  ('uber',             'contains', 'Transporte',      0, 42, datetime('now')),
  ('99 ',              'contains', 'Transporte',      0, 42, datetime('now')),
  ('posto',            'contains', 'Combustivel',     0, 43, datetime('now')),
  ('ipiranga',         'contains', 'Combustivel',     0, 43, datetime('now')),
  ('shell',            'contains', 'Combustivel',     0, 43, datetime('now')),
  ('petrobras',        'contains', 'Combustivel',     0, 43, datetime('now')),
  ('estaciona',        'contains', 'Transporte',      0, 44, datetime('now')),
  ('supermercado',     'contains', 'Mercado',         0, 45, datetime('now')),
  ('hirota',           'contains', 'Mercado',         0, 45, datetime('now')),
  ('atacad',           'contains', 'Mercado',         0, 45, datetime('now')),
  ('mercado',          'contains', 'Mercado',         0, 46, datetime('now')),
  ('padaria',          'contains', 'Alimentacao',     0, 47, datetime('now')),
  ('restaurante',      'contains', 'Alimentacao',     0, 47, datetime('now')),
  ('lanchonete',       'contains', 'Alimentacao',     0, 47, datetime('now')),
  ('pizzaria',         'contains', 'Alimentacao',     0, 47, datetime('now')),
  ('farmacia',         'contains', 'Saude',           0, 50, datetime('now')),
  ('drogaria',         'contains', 'Saude',           0, 50, datetime('now')),
  ('drogasil',         'contains', 'Saude',           0, 50, datetime('now')),
  ('netflix',          'contains', 'Assinaturas',     0, 55, datetime('now')),
  ('spotify',          'contains', 'Assinaturas',     0, 55, datetime('now')),
  ('youtube',          'contains', 'Assinaturas',     0, 55, datetime('now')),
  ('apple',            'contains', 'Assinaturas',     0, 55, datetime('now')),
  ('google',           'contains', 'Assinaturas',     0, 55, datetime('now')),
  ('amazon',           'contains', 'Compras',         0, 56, datetime('now')),
  ('mercadolivre',     'contains', 'Compras',         0, 56, datetime('now')),
  ('mercado livre',    'contains', 'Compras',         0, 56, datetime('now')),
  ('shopee',           'contains', 'Compras',         0, 56, datetime('now')),
  ('aliexpress',       'contains', 'Compras',         0, 56, datetime('now')),
  ('cloudflare',       'contains', 'Infra e software',0, 57, datetime('now')),
  ('vercel',           'contains', 'Infra e software',0, 57, datetime('now')),
  ('airtable',         'contains', 'Infra e software',0, 57, datetime('now')),
  ('openai',           'contains', 'Infra e software',0, 57, datetime('now')),
  ('anthropic',        'contains', 'Infra e software',0, 57, datetime('now')),
  ('registro.br',      'contains', 'Infra e software',0, 57, datetime('now')),
  ('github',           'contains', 'Infra e software',0, 57, datetime('now')),
  ('figma',            'contains', 'Infra e software',0, 57, datetime('now')),
  ('adobe',            'contains', 'Infra e software',0, 57, datetime('now')),
  ('enel',             'contains', 'Casa',            0, 60, datetime('now')),
  ('cpfl',             'contains', 'Casa',            0, 60, datetime('now')),
  ('sabesp',           'contains', 'Casa',            0, 60, datetime('now')),
  ('energia',          'contains', 'Casa',            0, 60, datetime('now')),
  ('aluguel',          'contains', 'Casa',            0, 60, datetime('now')),
  ('condominio',       'contains', 'Casa',            0, 60, datetime('now')),
  ('internet',         'contains', 'Casa',            0, 61, datetime('now')),
  ('vivo',             'contains', 'Telefone',        0, 62, datetime('now')),
  ('claro',            'contains', 'Telefone',        0, 62, datetime('now')),
  ('tim ',             'contains', 'Telefone',        0, 62, datetime('now')),
  ('academia',         'contains', 'Saude',           0, 63, datetime('now')),
  ('smart fit',        'contains', 'Saude',           0, 63, datetime('now')),
  ('iof',              'contains', 'Tarifas e juros', 0, 70, datetime('now')),
  ('tarifa',           'contains', 'Tarifas e juros', 0, 70, datetime('now')),
  ('juros',            'contains', 'Tarifas e juros', 0, 70, datetime('now')),
  ('anuidade',         'contains', 'Tarifas e juros', 0, 70, datetime('now')),
  ('multa',            'contains', 'Tarifas e juros', 0, 70, datetime('now')),
  ('darf',             'contains', 'Impostos',        0, 71, datetime('now')),
  ('das ',             'contains', 'Impostos',        0, 71, datetime('now')),
  ('inss',             'contains', 'Impostos',        0, 71, datetime('now')),
  ('ipva',             'contains', 'Impostos',        0, 71, datetime('now')),
  ('iptu',             'contains', 'Impostos',        0, 71, datetime('now')),
  ('saque',            'contains', 'Saque',           0, 80, datetime('now')),
  ('pix',              'contains', 'PIX sem categoria',0, 95, datetime('now'));
