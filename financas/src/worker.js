/**
 * Financas pessoais via Open Finance (Pluggy / Meu Pluggy)
 * Cloudflare Worker + D1. Leitura apenas: a Pluggy nunca recebe escrita daqui.
 *
 * Bindings esperados (ver wrangler.toml):
 *   DB                    -> D1
 *   PLUGGY_CLIENT_ID      -> secret
 *   PLUGGY_CLIENT_SECRET  -> secret
 *   PLUGGY_ITEM_IDS       -> var, itemIds separados por virgula
 *   APP_TOKEN             -> secret, token unico do painel
 *   BACKFILL_FROM         -> var opcional, 'YYYY-MM-DD' (default: 24 meses atras)
 *   ACCOUNT_LABELS        -> var opcional, 'accountId=Nubank,accountId=Itau'
 *
 * Alem da Pluggy, aceita "creditos por fora" lancados a mao ou por CSV
 * (cartao de loja, Keeta, crediario): rotas /api/manual/*.
 */

const PLUGGY = 'https://api.pluggy.ai';
const LOOKBACK_DAYS = 10;      // janela reconferida em cada sync (PENDING -> POSTED, lancamento atrasado)
const MAX_PAGES_PER_RUN = 25;  // teto de paginas por execucao, por causa do limite de subrequests do Worker

/* ---------------------------------------------------------------- utils */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const deaccent = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const ymd = (d) => d.toISOString().slice(0, 10);

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function monthsAgo(n) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

/** Chave normalizada usada para agrupar lancamentos recorrentes. */
function recurrenceKey(description, merchant) {
  const base = deaccent(merchant || description)
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return base.slice(0, 4).join(' ') || deaccent(description).slice(0, 24);
}

/**
 * Normaliza o sinal do valor. Esse e o ponto onde a Pluggy mais confunde:
 *  - Cartao de credito: amount positivo = nova compra (aumenta a divida) => saida.
 *                       amount negativo = pagamento ou estorno da fatura  => entrada.
 *  - Conta bancaria:    o sinal de amount nao e garantido pela doc. A fonte de
 *                       verdade e o campo `type`: DEBIT = saida, CREDIT = entrada.
 */
function normalizeFlow(tx, accountType) {
  const amount = Number(tx.amount) || 0;
  if (accountType === 'CREDIT') return -amount;
  const isOut = String(tx.type || '').toUpperCase() === 'DEBIT';
  return isOut ? -Math.abs(amount) : Math.abs(amount);
}

/* ------------------------------------------------------------- meta (kv) */

async function metaGet(env, key) {
  const row = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

async function metaSet(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(key, value == null ? null : String(value))
    .run();
}

async function metaDel(env, key) {
  await env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(key).run();
}

/* ------------------------------------------------------------ pluggy api */

/**
 * A API Key vale 2 horas e POST /auth tem rate limit, por isso fica em cache no D1
 * com 10 minutos de folga antes do vencimento.
 */
async function getApiKey(env) {
  const cached = await metaGet(env, 'pluggy_api_key');
  const exp = await metaGet(env, 'pluggy_api_key_exp');
  if (cached && exp && Date.now() < Number(exp)) return cached;

  const res = await fetch(`${PLUGGY}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: env.PLUGGY_CLIENT_ID,
      clientSecret: env.PLUGGY_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /auth ${res.status}: ${body.slice(0, 300)}`);
  }

  const { apiKey } = await res.json();
  if (!apiKey) throw new Error('POST /auth respondeu sem apiKey');

  await metaSet(env, 'pluggy_api_key', apiKey);
  await metaSet(env, 'pluggy_api_key_exp', Date.now() + 110 * 60 * 1000);
  return apiKey;
}

async function pluggyGet(env, pathWithQuery, apiKey) {
  const res = await fetch(`${PLUGGY}${pathWithQuery}`, {
    headers: { 'X-API-KEY': apiKey, 'content-type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${pathWithQuery} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GET ${pathWithQuery} devolveu resposta nao-JSON`);
  }
}

/* ---------------------------------------------------------- categorizacao */

async function loadRules(env) {
  const { results } = await env.DB.prepare(
    'SELECT pattern, match_type, category, is_transfer FROM category_rules WHERE active = 1 ORDER BY priority ASC, id ASC'
  ).all();
  return (results || []).map((r) => ({
    ...r,
    needle: deaccent(r.pattern),
    rx: r.match_type === 'regex' ? safeRegex(r.pattern) : null,
  }));
}

function safeRegex(pattern) {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function categorize(tx, rules, flow) {
  const haystack = deaccent(
    [tx.description, tx.descriptionRaw, tx.merchant && tx.merchant.name].filter(Boolean).join(' | ')
  );
  const opType = String(tx.operationType || '').toUpperCase();

  for (const rule of rules) {
    let hit = false;
    if (rule.match_type === 'operation_type') hit = opType && opType === rule.pattern.toUpperCase();
    else if (rule.match_type === 'regex') hit = rule.rx ? rule.rx.test(haystack) : false;
    else hit = rule.needle.length > 0 && haystack.includes(rule.needle);

    if (hit) {
      return { category: rule.category, source: 'rule', isTransfer: rule.is_transfer ? 1 : 0 };
    }
  }

  if (tx.category) return { category: tx.category, source: 'pluggy', isTransfer: 0 };
  if (flow > 0) return { category: 'Entradas', source: 'fallback', isTransfer: 0 };
  return { category: 'Sem categoria', source: 'fallback', isTransfer: 0 };
}

/* ------------------------------------------------------------------ sync */

function parseLabels(env) {
  const out = {};
  for (const part of String(env.ACCOUNT_LABELS || '').split(',')) {
    const [id, ...rest] = part.split('=');
    if (id && rest.length) out[id.trim()] = rest.join('=').trim();
  }
  return out;
}

const TX_UPSERT = `
INSERT INTO transactions (
  id, account_id, item_id, date, day, month, description, description_raw, rkey,
  amount, flow, direction, currency_code, type, status, operation_type,
  pluggy_category, merchant_name, installment_number, total_installments,
  category, category_source, is_transfer, raw, first_seen_at, synced_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  date            = excluded.date,
  day             = excluded.day,
  month           = excluded.month,
  description     = excluded.description,
  description_raw = excluded.description_raw,
  rkey            = excluded.rkey,
  amount          = excluded.amount,
  flow            = excluded.flow,
  direction       = excluded.direction,
  type            = excluded.type,
  status          = excluded.status,
  operation_type  = excluded.operation_type,
  pluggy_category = excluded.pluggy_category,
  merchant_name   = excluded.merchant_name,
  raw             = excluded.raw,
  synced_at       = datetime('now'),
  category        = CASE WHEN transactions.category_source = 'manual' THEN transactions.category        ELSE excluded.category        END,
  category_source = CASE WHEN transactions.category_source = 'manual' THEN 'manual'                     ELSE excluded.category_source END,
  is_transfer     = CASE WHEN transactions.category_source = 'manual' THEN transactions.is_transfer     ELSE excluded.is_transfer     END`;

function txStatement(env, tx, account, rules) {
  const flow = normalizeFlow(tx, account.type);
  const cat = categorize(tx, rules, flow);
  const dateIso = String(tx.date || '');
  const day = dateIso.slice(0, 10);
  const meta = tx.creditCardMetadata || {};

  return env.DB.prepare(TX_UPSERT).bind(
    tx.id,
    account.id,
    account.itemId || account.item_id || null,
    dateIso,
    day,
    day.slice(0, 7),
    tx.description || '',
    tx.descriptionRaw || null,
    recurrenceKey(tx.description, tx.merchant && tx.merchant.name),
    Number(tx.amount) || 0,
    flow,
    flow < 0 ? 'OUT' : 'IN',
    tx.currencyCode || 'BRL',
    tx.type || null,
    tx.status || null,
    tx.operationType || null,
    tx.category || null,
    (tx.merchant && tx.merchant.name) || null,
    meta.installmentNumber == null ? null : Number(meta.installmentNumber),
    meta.totalInstallments == null ? null : Number(meta.totalInstallments),
    cat.category,
    cat.source,
    cat.isTransfer,
    JSON.stringify(tx)
  );
}

async function runBatched(env, statements, chunk = 40) {
  let done = 0;
  for (let i = 0; i < statements.length; i += chunk) {
    await env.DB.batch(statements.slice(i, i + chunk));
    done += Math.min(chunk, statements.length - i);
  }
  return done;
}

async function sync(env, mode = 'incremental') {
  const startedAt = new Date().toISOString();
  const itemIds = String(env.PLUGGY_ITEM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!itemIds.length) {
    return {
      mode, items: [], pages: 0, upserted: 0, pendingBackfill: false,
      warnings: ['PLUGGY_ITEM_IDS esta vazio: nada para ler do Open Finance. Os creditos por fora continuam funcionando.'],
    };
  }

  const apiKey = await getApiKey(env);
  const rules = await loadRules(env);
  const labels = parseLabels(env);
  const backfillFrom = env.BACKFILL_FROM || ymd(monthsAgo(24));

  let budget = MAX_PAGES_PER_RUN;
  let pages = 0;
  let upserted = 0;
  const report = { mode, items: [], warnings: [], pendingBackfill: false };

  for (const itemId of itemIds) {
    const item = await pluggyGet(env, `/items/${itemId}`, apiKey);

    await env.DB.prepare(
      `INSERT INTO items (id, connector_name, status, execution_status, consent_expires_at, last_updated_at, synced_at)
       VALUES (?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         connector_name = excluded.connector_name,
         status = excluded.status,
         execution_status = excluded.execution_status,
         consent_expires_at = excluded.consent_expires_at,
         last_updated_at = excluded.last_updated_at,
         synced_at = datetime('now')`
    )
      .bind(
        item.id,
        (item.connector && item.connector.name) || null,
        item.status || null,
        item.executionStatus || null,
        item.consentExpiresAt || null,
        item.lastUpdatedAt || null
      )
      .run();

    if (item.consentExpiresAt) {
      const left = Math.floor((new Date(item.consentExpiresAt) - Date.now()) / 86400000);
      if (left <= 30) {
        report.warnings.push(
          `Autorizacao do item ${item.id} expira em ${left} dia(s). Renove entrando de novo em Connect Account no dashboard da Pluggy: a API nao renova.`
        );
      }
    }
    if (item.executionStatus === 'USER_AUTHORIZATION_EXPIRED') {
      report.warnings.push(`Item ${item.id}: autorizacao expirada, leituras voltarao vazias ate renovar.`);
    }

    const accountsRes = await pluggyGet(env, `/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey);
    const accounts = accountsRes.results || [];
    const accStatements = accounts.map((a) => {
      const credit = a.creditData || {};
      return env.DB.prepare(
        `INSERT INTO accounts (
           id, item_id, type, subtype, name, marketing_name, number, owner, currency_code,
           balance, credit_limit, available_credit_limit, balance_due_date, minimum_payment,
           bank_name, active, raw, synced_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type, subtype = excluded.subtype, name = excluded.name,
           marketing_name = excluded.marketing_name, number = excluded.number, owner = excluded.owner,
           currency_code = excluded.currency_code, balance = excluded.balance,
           credit_limit = excluded.credit_limit, available_credit_limit = excluded.available_credit_limit,
           balance_due_date = excluded.balance_due_date, minimum_payment = excluded.minimum_payment,
           bank_name = COALESCE(excluded.bank_name, accounts.bank_name),
           active = 1, raw = excluded.raw, synced_at = datetime('now')`
      ).bind(
        a.id,
        a.itemId || itemId,
        a.type || null,
        a.subtype || null,
        a.name || null,
        a.marketingName || null,
        a.number || null,
        a.owner || null,
        a.currencyCode || 'BRL',
        a.balance == null ? null : Number(a.balance),
        credit.creditLimit == null ? null : Number(credit.creditLimit),
        credit.availableCreditLimit == null ? null : Number(credit.availableCreditLimit),
        credit.balanceDueDate || null,
        credit.minimumPayment == null ? null : Number(credit.minimumPayment),
        labels[a.id] || (item.connector && item.connector.name) || null,
        JSON.stringify(a)
      );
    });
    if (accStatements.length) await runBatched(env, accStatements);

    const itemReport = { itemId, connector: (item.connector && item.connector.name) || null, accounts: [] };

    for (const account of accounts) {
      const doneKey = `backfill_done:${account.id}`;
      const cursorKey = `cursor:${account.id}`;
      const backfilled = (await metaGet(env, doneKey)) === '1';
      const fullPass = mode === 'full' || !backfilled;

      // O cursor so e retomado durante a carga historica. No sync incremental ele seria
      // um ponto antigo da paginacao e faria a janela recente ser pulada.
      const savedCursor = fullPass ? await metaGet(env, cursorKey) : null;
      if (!fullPass && (await metaGet(env, cursorKey))) await metaDel(env, cursorKey);

      let query =
        savedCursor ||
        `?accountId=${encodeURIComponent(account.id)}&dateFrom=${
          fullPass ? backfillFrom : ymd(daysAgo(LOOKBACK_DAYS))
        }`;

      let accPages = 0;
      let accRows = 0;

      while (budget > 0) {
        const page = await pluggyGet(env, `/v2/transactions${query}`, apiKey);
        budget -= 1;
        accPages += 1;
        pages += 1;

        const rows = page.results || [];
        if (rows.length) {
          const statements = rows.map((tx) => txStatement(env, tx, account, rules));
          accRows += await runBatched(env, statements);
        }

        if (page.next) {
          query = page.next;
          if (fullPass) await metaSet(env, cursorKey, query);
        } else {
          await metaDel(env, cursorKey);
          await metaSet(env, doneKey, '1');
          break;
        }
      }

      if (budget <= 0 && (await metaGet(env, cursorKey))) report.pendingBackfill = true;
      upserted += accRows;
      itemReport.accounts.push({
        id: account.id,
        name: account.name,
        type: account.type,
        pages: accPages,
        rows: accRows,
      });
    }

    report.items.push(itemReport);
  }

  if (report.pendingBackfill) {
    report.warnings.push(
      'Carga historica ainda incompleta: o teto de paginas por execucao foi atingido. Chame POST /api/sync de novo (ou espere o cron) e ela continua de onde parou.'
    );
  }

  report.pages = pages;
  report.upserted = upserted;
  await metaSet(env, 'last_sync_at', new Date().toISOString());

  await env.DB.prepare(
    `INSERT INTO sync_log (started_at, ended_at, mode, pages, upserted, ok, detail)
     VALUES (?, datetime('now'), ?, ?, ?, 1, ?)`
  )
    .bind(startedAt, mode, pages, upserted, JSON.stringify(report.warnings))
    .run();

  return report;
}

/* ------------------------------------------------------------- analytics */

function periodDefaults(url) {
  const to = url.searchParams.get('to') || ymd(new Date());
  const from = url.searchParams.get('from') || ymd(monthsAgo(6));
  return { from, to };
}

async function overview(env, url) {
  const { from, to } = periodDefaults(url);
  const db = env.DB;

  const totals = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN flow < 0 THEN -flow END), 0) AS saidas,
         COALESCE(SUM(CASE WHEN flow > 0 THEN  flow END), 0) AS entradas,
         COUNT(*) AS lancamentos
       FROM transactions
       WHERE day BETWEEN ? AND ? AND is_transfer = 0`
    )
    .bind(from, to)
    .first();

  const byCategory = await db
    .prepare(
      `SELECT category, COALESCE(SUM(-flow), 0) AS total, COUNT(*) AS n
       FROM transactions
       WHERE day BETWEEN ? AND ? AND is_transfer = 0 AND flow < 0
       GROUP BY category ORDER BY total DESC`
    )
    .bind(from, to)
    .all();

  const byMonth = await db
    .prepare(
      `SELECT month,
              COALESCE(SUM(CASE WHEN flow < 0 THEN -flow END), 0) AS saidas,
              COALESCE(SUM(CASE WHEN flow > 0 THEN  flow END), 0) AS entradas
       FROM transactions
       WHERE day BETWEEN ? AND ? AND is_transfer = 0
       GROUP BY month ORDER BY month ASC`
    )
    .bind(from, to)
    .all();

  const byAccount = await db
    .prepare(
      `SELECT t.account_id,
              COALESCE(a.bank_name, a.name, t.account_id) AS label,
              a.type AS account_type,
              COALESCE(SUM(-t.flow), 0) AS total
       FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.day BETWEEN ? AND ? AND t.is_transfer = 0 AND t.flow < 0
       GROUP BY t.account_id ORDER BY total DESC`
    )
    .bind(from, to)
    .all();

  const biggest = await db
    .prepare(
      `SELECT t.id, t.day, t.description, t.category, -t.flow AS valor,
              COALESCE(a.bank_name, a.name) AS conta, t.installment_number, t.total_installments
       FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.day BETWEEN ? AND ? AND t.is_transfer = 0 AND t.flow < 0
       ORDER BY t.flow ASC LIMIT 20`
    )
    .bind(from, to)
    .all();

  // Recorrencias: mesma chave normalizada aparecendo em 3 ou mais meses distintos.
  const recurring = await db
    .prepare(
      `SELECT rkey,
              MAX(description) AS exemplo,
              COUNT(DISTINCT month) AS meses,
              ROUND(AVG(-flow), 2) AS media,
              MAX(day) AS ultimo,
              MAX(category) AS category
       FROM transactions
       WHERE day BETWEEN ? AND ? AND is_transfer = 0 AND flow < 0 AND rkey <> ''
       GROUP BY rkey HAVING meses >= 3
       ORDER BY media * meses DESC LIMIT 30`
    )
    .bind(from, to)
    .all();

  const uncategorized = await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(-flow), 0) AS total
       FROM transactions
       WHERE day BETWEEN ? AND ? AND is_transfer = 0 AND flow < 0
         AND category IN ('Sem categoria', 'PIX sem categoria')`
    )
    .bind(from, to)
    .first();

  // Parcelas ja compradas que caem nos proximos meses (manuais e, se a Pluggy mandar, do banco).
  const upcoming = await db
    .prepare(
      `SELECT t.month, COALESCE(SUM(-t.flow), 0) AS total, COUNT(*) AS n,
              SUM(CASE WHEN t.source = 'manual' THEN -t.flow ELSE 0 END) AS manual
       FROM transactions t
       WHERE t.day > ? AND t.is_transfer = 0 AND t.flow < 0
       GROUP BY t.month ORDER BY t.month ASC LIMIT 12`
    )
    .bind(ymd(new Date()))
    .all();

  const monthsCount = (byMonth.results || []).length || 1;

  return {
    period: { from, to },
    totals: {
      ...totals,
      saldo: (totals.entradas || 0) - (totals.saidas || 0),
      media_mensal_saidas: (totals.saidas || 0) / monthsCount,
    },
    uncategorized,
    byCategory: byCategory.results || [],
    byMonth: byMonth.results || [],
    byAccount: byAccount.results || [],
    biggest: biggest.results || [],
    recurring: recurring.results || [],
    upcoming: upcoming.results || [],
  };
}

async function listTransactions(env, url) {
  const { from, to } = periodDefaults(url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
  const offset = Number(url.searchParams.get('offset')) || 0;
  const category = url.searchParams.get('category');
  const accountId = url.searchParams.get('account');
  const q = url.searchParams.get('q');
  const includeTransfers = url.searchParams.get('transfers') === '1';

  const where = ['t.day BETWEEN ? AND ?'];
  const binds = [from, to];
  if (!includeTransfers) where.push('t.is_transfer = 0');
  if (category) {
    where.push('t.category = ?');
    binds.push(category);
  }
  if (accountId) {
    where.push('t.account_id = ?');
    binds.push(accountId);
  }
  if (q) {
    where.push("(lower(t.description) LIKE ? OR lower(COALESCE(t.description_raw, '')) LIKE ?)");
    binds.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }

  const sql = `SELECT t.id, t.day, t.description, t.category, t.category_source, t.is_transfer,
                      t.flow, t.amount, t.type, t.status, t.operation_type,
                      t.installment_number, t.total_installments,
                      t.source, t.group_id,
                      COALESCE(a.bank_name, a.name) AS conta, a.type AS account_type
               FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
               WHERE ${where.join(' AND ')}
               ORDER BY t.day DESC, t.flow ASC
               LIMIT ? OFFSET ?`;

  const { results } = await env.DB.prepare(sql)
    .bind(...binds, limit, offset)
    .all();

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM transactions t WHERE ${where.join(' AND ')}`
  )
    .bind(...binds)
    .first();

  return { period: { from, to }, total: count.n, limit, offset, results: results || [] };
}

/** Reaplica as regras sobre o que ja esta gravado. Nao toca no que foi ajustado a mao. */
async function recategorize(env, limit = 2000, offset = 0) {
  const rules = await loadRules(env);
  // Paginado por offset com ordem estavel: como o UPDATE nao muda o filtro
  // (category_source continua diferente de 'manual'), sem offset a mesma
  // primeira pagina seria reprocessada para sempre.
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.description, t.description_raw, t.merchant_name, t.operation_type,
            t.pluggy_category, t.flow
     FROM transactions t
     WHERE t.category_source <> 'manual'
     ORDER BY t.id
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all();

  const statements = (results || []).map((row) => {
    const fake = {
      description: row.description,
      descriptionRaw: row.description_raw,
      merchant: row.merchant_name ? { name: row.merchant_name } : null,
      operationType: row.operation_type,
      category: row.pluggy_category,
    };
    const cat = categorize(fake, rules, row.flow);
    return env.DB.prepare(
      'UPDATE transactions SET category = ?, category_source = ?, is_transfer = ? WHERE id = ?'
    ).bind(cat.category, cat.source, cat.isTransfer, row.id);
  });

  const updated = await runBatched(env, statements);
  const scanned = (results || []).length;
  return {
    updated,
    scanned,
    offset,
    next_offset: scanned === limit ? offset + limit : null,
    done: scanned < limit,
  };
}

/* ---------------------------------------------- creditos por fora (manual) */
/*
 * Cartao de loja (Renner, Riachuelo, C&A...), Keeta, crediario, "pague depois":
 * credito que o Open Finance nao enxerga. Vira uma conta com source = 'manual'
 * na mesma tabela `accounts`, entao entra em todos os totais, graficos e filtros
 * como qualquer cartao da Pluggy. O sync da Pluggy nunca toca nessas linhas
 * (ids com prefixo man_, e o upsert so atualiza ids que vieram da Pluggy).
 *
 * Convencao de sinal igual a do cartao na Pluggy: amount positivo = compra,
 * flow negativo = saida. Pagamento de fatura e estorno entram como is_transfer = 1,
 * pelo mesmo motivo do README: o gasto e a compra, nao o pagamento.
 */

const MANUAL_KINDS = ['STORE_CARD', 'DELIVERY_APP', 'BNPL', 'CREDIARIO', 'LOAN', 'OTHER'];
const MAX_INSTALLMENTS = 72;
const MAX_ROWS_PER_REQUEST = 1500;

const pad2 = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12

function mkDay(y, m, d) {
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${pad2(m)}-${pad2(Math.min(d, daysInMonth(y, m)))}`;
}

function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return mkDay(y, m + n, d);
}

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));

function dayOrNull(v) {
  const n = Math.trunc(Number(v));
  return n >= 1 && n <= 31 ? n : null;
}

/**
 * Em qual fatura cai um lancamento. A fatura fecha no closing_day; o que for
 * depois do fechamento vai para a seguinte. O vencimento e o primeiro due_day
 * depois do fechamento. Sem dias configurados, a "fatura" e o proprio mes.
 */
function billOf(day, closingDay, dueDay) {
  const [y, m, d] = day.split('-').map(Number);
  if (!closingDay) return { key: day.slice(0, 7), close: null, due: dueDay ? mkDay(y, m, dueDay) : null };
  let cy = y;
  let cm = m;
  if (d > Math.min(closingDay, daysInMonth(y, m))) cm += 1;
  const close = mkDay(cy, cm, closingDay);
  let due = null;
  if (dueDay) due = mkDay(cy, dueDay <= closingDay ? cm + 1 : cm, dueDay);
  return { key: (due || close).slice(0, 7), close, due };
}

async function getManualAccount(env, id) {
  return env.DB.prepare("SELECT * FROM accounts WHERE id = ? AND source = 'manual'").bind(id).first();
}

async function setPaymentRule(env, accountId, pattern) {
  await env.DB.prepare('DELETE FROM category_rules WHERE account_id = ?').bind(accountId).run();
  const p = String(pattern || '').trim();
  if (!p) return false;
  await env.DB.prepare(
    `INSERT INTO category_rules (pattern, match_type, category, is_transfer, priority, active, created_at, account_id)
     VALUES (?, 'contains', 'Pagamento de fatura', 1, 9, 1, datetime('now'), ?)`
  )
    .bind(p, accountId)
    .run();
  return true;
}

function manualAccountFields(b) {
  return {
    name: String(b.name || '').trim().slice(0, 80),
    kind: MANUAL_KINDS.includes(b.kind) ? b.kind : 'OTHER',
    credit_limit: b.credit_limit === '' || b.credit_limit == null ? null : Number(b.credit_limit) || 0,
    closing_day: dayOrNull(b.closing_day),
    due_day: dayOrNull(b.due_day),
    payment_pattern: String(b.payment_pattern || '').trim().slice(0, 120) || null,
    notes: String(b.notes || '').trim().slice(0, 500) || null,
  };
}

async function createManualAccount(env, b) {
  const f = manualAccountFields(b);
  if (!f.name) return json({ error: 'nome e obrigatorio' }, 400);
  const id = `man_acc_${crypto.randomUUID().slice(0, 12)}`;
  await env.DB.prepare(
    `INSERT INTO accounts (id, item_id, type, subtype, name, bank_name, currency_code, credit_limit,
       active, source, closing_day, due_day, payment_pattern, notes, synced_at)
     VALUES (?, NULL, 'CREDIT', ?, ?, ?, 'BRL', ?, 1, 'manual', ?, ?, ?, ?, datetime('now'))`
  )
    .bind(id, f.kind, f.name, f.name, f.credit_limit, f.closing_day, f.due_day, f.payment_pattern, f.notes)
    .run();
  const ruleCreated = await setPaymentRule(env, id, f.payment_pattern);
  return json({ ok: true, id, recategorize: ruleCreated });
}

async function updateManualAccount(env, id, b) {
  const acc = await getManualAccount(env, id);
  if (!acc) return json({ error: 'credito nao encontrado' }, 404);
  const f = manualAccountFields({ ...acc, kind: acc.subtype, ...b });
  if (!f.name) return json({ error: 'nome e obrigatorio' }, 400);
  await env.DB.prepare(
    `UPDATE accounts SET subtype = ?, name = ?, bank_name = ?, credit_limit = ?, closing_day = ?,
       due_day = ?, payment_pattern = ?, notes = ?, synced_at = datetime('now')
     WHERE id = ? AND source = 'manual'`
  )
    .bind(f.kind, f.name, f.name, f.credit_limit, f.closing_day, f.due_day, f.payment_pattern, f.notes, id)
    .run();
  const patternChanged = (acc.payment_pattern || null) !== f.payment_pattern;
  if (patternChanged) await setPaymentRule(env, id, f.payment_pattern);
  return json({ ok: true, id, recategorize: patternChanged });
}

async function deleteManualAccount(env, id) {
  const acc = await getManualAccount(env, id);
  if (!acc) return json({ error: 'credito nao encontrado' }, 404);
  const hadRule = !!acc.payment_pattern;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM transactions WHERE account_id = ? AND source = 'manual'").bind(id),
    env.DB.prepare('DELETE FROM category_rules WHERE account_id = ?').bind(id),
    env.DB.prepare("DELETE FROM accounts WHERE id = ? AND source = 'manual'").bind(id),
  ]);
  return json({ ok: true, recategorize: hadRule });
}

/** Contas manuais com divida, limite disponivel e proximas faturas. */
async function listManualAccounts(env) {
  const today = ymd(new Date());
  const { results: accounts } = await env.DB.prepare(
    "SELECT * FROM accounts WHERE source = 'manual' AND active = 1 ORDER BY name"
  ).all();

  const out = [];
  for (const a of accounts || []) {
    const { results: txs } = await env.DB.prepare(
      'SELECT day, flow, is_transfer FROM transactions WHERE account_id = ?'
    )
      .bind(a.id)
      .all();

    let owed = 0;
    let paid = 0;
    let purchases = 0;
    const bills = {};
    for (const t of txs || []) {
      owed -= t.flow;
      if (t.flow > 0) paid += t.flow;
      else purchases -= t.flow;
      if (t.flow < 0) {
        const b = billOf(t.day, a.closing_day, a.due_day);
        const cur = bills[b.key] || (bills[b.key] = { key: b.key, close: b.close, due: b.due, total: 0, n: 0 });
        cur.total += -t.flow;
        cur.n += 1;
      }
    }

    // Faturas que ainda nao venceram (a aberta e as futuras, com parcelas ja comprometidas).
    // As antigas saem daqui: a divida total ja considera o que foi pago.
    const upcoming = Object.values(bills)
      .filter((b) => (b.due || b.close || `${b.key}-31`) >= today)
      .sort((x, y) => (x.key < y.key ? -1 : 1))
      .slice(0, 12)
      .map((b) => ({ ...b, total: Math.round(b.total * 100) / 100 }));

    const round = (n) => Math.round(n * 100) / 100;
    out.push({
      id: a.id,
      name: a.name,
      kind: a.subtype,
      credit_limit: a.credit_limit,
      closing_day: a.closing_day,
      due_day: a.due_day,
      payment_pattern: a.payment_pattern,
      notes: a.notes,
      owed: round(owed),
      paid: round(paid),
      purchases: round(purchases),
      available: a.credit_limit == null ? null : round(a.credit_limit - owed),
      lancamentos: (txs || []).length,
      upcoming,
      current_bill: billOf(today, a.closing_day, a.due_day),
    });
  }
  return json({ results: out });
}

const MANUAL_TX_INSERT = `
INSERT INTO transactions (
  id, account_id, item_id, date, day, month, description, description_raw, rkey,
  amount, flow, direction, currency_code, type, status, operation_type,
  pluggy_category, merchant_name, installment_number, total_installments,
  category, category_source, is_transfer, raw, first_seen_at, synced_at, source, group_id
) VALUES (?,?,NULL,?,?,?,?,NULL,?,?,?,?,'BRL',?,'POSTED',NULL,NULL,NULL,?,?,?,?,?,?,datetime('now'),datetime('now'),'manual',?)`;

/** Divide em centavos: a sobra do arredondamento vai na primeira parcela. */
function splitCents(total, n) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? rest : 0)) / 100);
}

/**
 * Recebe {account_id, entries:[...]}. Cada entry:
 *   { date:'YYYY-MM-DD', description, amount, kind:'compra'|'pagamento'|'estorno',
 *     installments: N,               // compra parcelada: gera N lancamentos mensais
 *     installment: [x, y],           // ou: esta linha ja E a parcela x de y (import de extrato)
 *     category }                     // opcional; vazio = regras de categorizacao
 */
async function addManualTransactions(env, b) {
  const acc = await getManualAccount(env, b.account_id);
  if (!acc) return json({ error: 'credito nao encontrado' }, 404);
  const entries = Array.isArray(b.entries) ? b.entries : [];
  if (!entries.length) return json({ error: 'nenhum lancamento' }, 400);

  const rules = await loadRules(env);
  const statements = [];
  const errors = [];

  entries.forEach((e, idx) => {
    const kind = ['compra', 'pagamento', 'estorno'].includes(e.kind) ? e.kind : 'compra';
    const amount = Math.abs(Number(e.amount) || 0);
    const description = String(e.description || '').trim().slice(0, 200) ||
      (kind === 'pagamento' ? `Pagamento ${acc.name}` : acc.name);
    if (!isDay(e.date)) return errors.push(`linha ${idx + 1}: data invalida`);
    if (!amount) return errors.push(`linha ${idx + 1}: valor invalido`);

    const groupId = `grp_${crypto.randomUUID().slice(0, 12)}`;
    const userCat = String(e.category || '').trim().slice(0, 60);

    const push = (day, value, flow, instNo, instTotal, cat) => {
      statements.push(
        env.DB.prepare(MANUAL_TX_INSERT).bind(
          `man_${crypto.randomUUID()}`,
          acc.id,
          `${day}T12:00:00.000Z`,
          day,
          day.slice(0, 7),
          description,
          recurrenceKey(description, null),
          value,
          flow,
          flow < 0 ? 'OUT' : 'IN',
          flow < 0 ? 'DEBIT' : 'CREDIT',
          instNo,
          instTotal,
          cat.category,
          cat.source,
          cat.isTransfer,
          JSON.stringify(e),
          groupId
        )
      );
    };

    if (kind !== 'compra') {
      const cat = kind === 'pagamento'
        ? { category: 'Pagamento de fatura', source: 'manual', isTransfer: 1 }
        : { category: 'Estorno', source: 'manual', isTransfer: 1 };
      push(e.date, -amount, amount, null, null, cat);
      return;
    }

    const cat = userCat
      ? { category: userCat, source: 'manual', isTransfer: 0 }
      : categorize({ description }, rules, -amount);

    if (Array.isArray(e.installment) && e.installment.length === 2) {
      const x = Math.trunc(Number(e.installment[0]));
      const y = Math.trunc(Number(e.installment[1]));
      const ok = x >= 1 && y >= x && y <= MAX_INSTALLMENTS;
      push(e.date, amount, -amount, ok ? x : null, ok ? y : null, cat);
      return;
    }

    const n = Math.min(Math.max(Math.trunc(Number(e.installments) || 1), 1), MAX_INSTALLMENTS);
    splitCents(amount, n).forEach((v, i) => {
      push(addMonths(e.date, i), v, -v, n > 1 ? i + 1 : null, n > 1 ? n : null, cat);
    });
  });

  if (statements.length > MAX_ROWS_PER_REQUEST) {
    return json({ error: `muitos lancamentos de uma vez (${statements.length}); mande em partes de ate ${MAX_ROWS_PER_REQUEST}` }, 400);
  }
  if (!statements.length) return json({ error: errors.join('; ') || 'nada para gravar', errors }, 400);
  const inserted = await runBatched(env, statements);
  return json({ ok: true, inserted, errors });
}

async function deleteManualTransaction(env, id, wholeGroup) {
  const row = await env.DB.prepare(
    "SELECT id, group_id FROM transactions WHERE id = ? AND source = 'manual'"
  )
    .bind(id)
    .first();
  if (!row) return json({ error: 'so lancamentos manuais podem ser apagados' }, 404);
  const res = wholeGroup && row.group_id
    ? await env.DB.prepare("DELETE FROM transactions WHERE group_id = ? AND source = 'manual'").bind(row.group_id).run()
    : await env.DB.prepare("DELETE FROM transactions WHERE id = ? AND source = 'manual'").bind(id).run();
  return json({ ok: true, deleted: (res.meta && res.meta.changes) || 1 });
}

/* ------------------------------------------------------------- roteamento */

function unauthorized() {
  return json({ error: 'nao autorizado' }, 401);
}

function checkAuth(request, env) {
  const expected = env.APP_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') || '';
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  const url = new URL(request.url);
  const token = bearer || url.searchParams.get('token') || '';
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = request.method.toUpperCase();

  if (path === '/ping') return json({ ok: true });

  if (!checkAuth(request, env)) return unauthorized();

  if (path === '/overview' && method === 'GET') return json(await overview(env, url));
  if (path === '/transactions' && method === 'GET') return json(await listTransactions(env, url));

  if (path === '/sync' && method === 'POST') {
    const mode = url.searchParams.get('mode') === 'full' ? 'full' : 'incremental';
    return json(await sync(env, mode));
  }

  if (path === '/recategorize' && method === 'POST') {
    return json(await recategorize(env, 2000, Number(url.searchParams.get('offset')) || 0));
  }

  if (path === '/accounts' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.item_id, a.type, a.subtype, a.name, a.bank_name, a.number, a.balance,
              a.credit_limit, a.available_credit_limit, a.balance_due_date, a.synced_at,
              a.source, a.closing_day, a.due_day,
              i.connector_name, i.status AS item_status, i.consent_expires_at
       FROM accounts a LEFT JOIN items i ON i.id = a.item_id
       WHERE a.active = 1 ORDER BY a.source DESC, a.type, a.name`
    ).all();
    return json({ results: results || [] });
  }

  if (path === '/health' && method === 'GET') {
    const items = await env.DB.prepare(
      'SELECT id, connector_name, status, execution_status, consent_expires_at, last_updated_at, synced_at FROM items'
    ).all();
    const last = await env.DB.prepare(
      'SELECT started_at, ended_at, mode, pages, upserted, detail FROM sync_log ORDER BY id DESC LIMIT 5'
    ).all();
    const counts = await env.DB.prepare(
      `SELECT COUNT(*) AS lancamentos, MIN(day) AS primeiro, MAX(day) AS ultimo FROM transactions`
    ).first();
    const enriched = (items.results || []).map((it) => ({
      ...it,
      consent_days_left: it.consent_expires_at
        ? Math.floor((new Date(it.consent_expires_at) - Date.now()) / 86400000)
        : null,
    }));
    return json({ items: enriched, counts, syncs: last.results || [], last_sync_at: await metaGet(env, 'last_sync_at') });
  }

  if (path === '/rules' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, pattern, match_type, category, is_transfer, priority, active FROM category_rules ORDER BY priority, id'
    ).all();
    return json({ results: results || [] });
  }

  if (path === '/rules' && method === 'POST') {
    const b = await request.json();
    if (!b.pattern || !b.category) return json({ error: 'pattern e category sao obrigatorios' }, 400);
    await env.DB.prepare(
      `INSERT INTO category_rules (pattern, match_type, category, is_transfer, priority, active, created_at)
       VALUES (?,?,?,?,?,1,datetime('now'))`
    )
      .bind(
        b.pattern,
        ['contains', 'regex', 'operation_type'].includes(b.match_type) ? b.match_type : 'contains',
        b.category,
        b.is_transfer ? 1 : 0,
        Number(b.priority) || 50
      )
      .run();
    return json(await recategorize(env));
  }

  const ruleDel = path.match(/^\/rules\/(\d+)$/);
  if (ruleDel && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM category_rules WHERE id = ?').bind(Number(ruleDel[1])).run();
    return json(await recategorize(env));
  }

  /* creditos por fora */
  if (path === '/manual/accounts' && method === 'GET') return listManualAccounts(env);
  if (path === '/manual/accounts' && method === 'POST') return createManualAccount(env, await request.json());
  const manAcc = path.match(/^\/manual\/accounts\/([^/]+)$/);
  if (manAcc && (method === 'PATCH' || method === 'PUT')) {
    return updateManualAccount(env, decodeURIComponent(manAcc[1]), await request.json());
  }
  if (manAcc && method === 'DELETE') return deleteManualAccount(env, decodeURIComponent(manAcc[1]));
  if (path === '/manual/transactions' && method === 'POST') {
    return addManualTransactions(env, await request.json());
  }
  const manTx = path.match(/^\/manual\/transactions\/([^/]+)$/);
  if (manTx && method === 'DELETE') {
    return deleteManualTransaction(env, decodeURIComponent(manTx[1]), url.searchParams.get('group') === '1');
  }

  const txPatch = path.match(/^\/transactions\/([^/]+)$/);
  if (txPatch && (method === 'PATCH' || method === 'PUT')) {
    const b = await request.json();
    const fields = [];
    const binds = [];
    if (typeof b.category === 'string' && b.category.trim()) {
      fields.push('category = ?');
      binds.push(b.category.trim());
    }
    if (b.is_transfer !== undefined) {
      fields.push('is_transfer = ?');
      binds.push(b.is_transfer ? 1 : 0);
    }
    if (!fields.length) return json({ error: 'nada para atualizar' }, 400);
    fields.push("category_source = 'manual'");
    await env.DB.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...binds, decodeURIComponent(txPatch[1]))
      .run();
    return json({ ok: true });
  }

  return json({ error: 'rota nao encontrada', path }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: String((err && err.message) || err) }, 500);
      }
    }

    // Qualquer outra rota: os assets estaticos (public/index.html) respondem antes
    // de chegar aqui. Isso e so a rede de seguranca.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Painel nao encontrado. Confira o bloco [assets] no wrangler.toml.', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const report = await sync(env, 'incremental');
          console.log('[sync]', JSON.stringify({ pages: report.pages, upserted: report.upserted, warnings: report.warnings }));
        } catch (err) {
          console.error('[sync] falhou:', String((err && err.message) || err));
          await env.DB.prepare(
            `INSERT INTO sync_log (started_at, ended_at, mode, pages, upserted, ok, detail)
             VALUES (datetime('now'), datetime('now'), 'cron', 0, 0, 0, ?)`
          )
            .bind(String((err && err.message) || err))
            .run();
        }
      })()
    );
  },
};
