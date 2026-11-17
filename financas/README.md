# Finanças pessoais via Open Finance

Painel próprio de análise de gastos lendo as suas contas e cartões pelo Open Finance,
usando o conector **Meu Pluggy** — que é gratuito, não expira com o trial, aceita até
5 conexões e é restrito a uso pessoal (uso comercial não é permitido nessa modalidade).

Também aceita **créditos por fora** (cartão de loja, Keeta, crediário), lançados a mão ou por CSV.

**Stack:** Cloudflare Worker + D1 + painel HTML single-file. Custo de infra: R$ 0.
**Leitura apenas.** Nenhuma rota deste projeto escreve na Pluggy ou movimenta dinheiro.

---

## 1. Lado Pluggy (uma vez)

1. Crie conta em **meu.pluggy.ai** e autorize cada banco ali. Banco adicionado depois
   precisa da autorização dele.
2. Entre no **Pluggy Developer Dashboard com a mesma conta**. Se você usa conectores
   customizados, habilite o MeuPluggy em *Customization → Connectors*.
3. *Applications → sua app → Demo → Connect Account →* escolha **MeuPluggy** (não o seu
   banco, não o Sandbox) e faça login com a conta do Meu Pluggy.
4. Copie o **itemId** em *Connected Items*, e o **Client ID** e o **Client Secret**.
   O secret aparece uma única vez; se perder, gere outro.
5. Se você tem vários bancos no Meu Pluggy, repita o *Connect Account* uma vez por banco.
   Cada um vira um itemId — coloque todos em `PLUGGY_ITEM_IDS`, separados por vírgula.

## 2. Banco de dados

```bash
npm run db:create          # copie o database_id para o wrangler.toml
npm run db:schema
npm run db:rules
```

## 3. Segredos e variáveis

```bash
wrangler secret put PLUGGY_CLIENT_ID
wrangler secret put PLUGGY_CLIENT_SECRET
wrangler secret put APP_TOKEN          # gere com: openssl rand -hex 32
```

No `wrangler.toml`, preencha `PLUGGY_ITEM_IDS` e, se quiser nomes bonitos nas contas,
`ACCOUNT_LABELS` (`accountId=Nubank,accountId=Itaú`).

## 4. Deploy e primeira carga

```bash
npm run deploy
```

Abra a URL do Worker, cole o `APP_TOKEN` e clique em **Sincronizar**.

A carga histórica é **resumível de propósito**: o Worker tem limite de subrequests por
execução, então cada sync lê no máximo 25 páginas (12.500 lançamentos) e guarda o cursor
no D1. Se o painel avisar que a carga está incompleta, clique em Sincronizar de novo até
o aviso sair. Depois disso o cron diário só lê a janela dos últimos 10 dias.

---

## 5. Créditos por fora (cartão de loja, Keeta, crediário)

O Open Finance não enxerga cartão de loja (Renner, Riachuelo, C&A, Pernambucanas...),
Keeta, crediário, carnê ou "pague depois". Para esses, use o bloco **Créditos por fora**
do painel:

1. **Adicionar crédito**: nome, tipo, limite e dias de **fechamento** e **vencimento**.
   Com os dois dias cadastrados, o painel calcula em qual fatura cai cada compra (compra
   depois do fechamento vai para a fatura seguinte) e mostra as próximas faturas.
2. **+ compra**: valor total e número de parcelas. Uma compra de R$ 100 em 3x vira
   R$ 33,34 + R$ 33,33 + R$ 33,33, uma por mês. As parcelas futuras ficam em
   **Parcelas a vencer** e só entram nos totais quando o mês chega.
3. **Pagar fatura**: já vem com o valor da próxima fatura preenchido. Reduz a dívida e
   **não** conta como gasto: o gasto é a compra.
4. **Importar**: cole as linhas da fatura ou do app (`data;descrição;valor;parcelas;categoria`).
   Aceita `;`, `,` ou tab, datas `dd/mm/aaaa` ou `aaaa-mm-dd` e valores `1.234,56`.
   Valor negativo = pagamento ou estorno. `3x` gera as 3 parcelas; `2/5` (ou "PARC 2/5"
   na descrição) grava só aquela parcela, do jeito que vem na fatura.

**Não contar duas vezes.** Se você paga a fatura da loja pela conta do banco, preencha
*"Como o pagamento aparece no extrato do banco"* (ex.: `pag boleto renner`). Isso cria uma
regra de prioridade 9 que marca esse pagamento como movimentação interna. Use um trecho
que só apareça no pagamento, não nas compras da loja.

Lançamentos manuais têm um **×** na lista para apagar (uma parcela ou a compra inteira).
O sync da Pluggy nunca toca neles. Funciona até sem nenhum banco conectado: com
`PLUGGY_ITEM_IDS` vazio, o sync só avisa e os créditos por fora continuam funcionando.

**Já tinha rodado o `schema.sql` antigo?** Rode uma vez `npm run db:migrate` antes do
deploy. Instalação nova não precisa: o `schema.sql` já tem tudo.

---

## Decisões que afetam os números

**Sinal do valor.** A Pluggy não usa a mesma convenção nos dois tipos de conta. Em cartão
de crédito, valor positivo é compra nova (aumenta a dívida) e negativo é pagamento ou
estorno. Em conta bancária o sinal não é garantido pela documentação — a fonte de verdade
é o campo `type` (`DEBIT` = saída, `CREDIT` = entrada). O Worker normaliza os dois casos
numa coluna `flow`, onde negativo é sempre saída. O `amount` cru fica guardado do lado,
junto com o JSON original, para você poder auditar.

**Dupla contagem.** Se você contar a compra no cartão *e* o pagamento da fatura saindo da
conta corrente, o mesmo dinheiro aparece duas vezes. A regra aqui é: a compra no cartão é
o gasto; o pagamento da fatura é marcado como movimentação interna (`is_transfer = 1`) e
fica fora de todos os totais. O mesmo vale para aplicação, resgate e transferência entre
contas suas. As regras que fazem isso estão no `seed-rules.sql` com prioridade 10 a 14 —
confira contra as descrições reais dos seus bancos, porque cada um escreve diferente.

**Categorização é sua.** O campo `category` da Pluggy exige plano Pro, então no Meu Pluggy
ele vem vazio. Quem categoriza é a tabela `category_rules`: padrão de texto, comparado sem
acento e em minúsculas contra descrição + descrição crua + merchant, primeira regra que
casa vence (menor `priority` primeiro). Você pode:

- criar regra pelo painel (vale para tudo que já está gravado, retroativo);
- clicar na categoria de um lançamento para corrigir só ele — isso marca
  `category_source = 'manual'` e o sync nunca mais sobrescreve;
- escrever `INTERNA` nesse mesmo campo para tirar o lançamento dos totais.

O painel mostra no topo quanto ainda está sem categoria, para você ir fechando.

**Recorrências** saem de uma chave normalizada da descrição (sem números, 4 primeiras
palavras com mais de 2 letras) que apareça em 3 meses distintos ou mais.

## O que exige atenção depois

- **A autorização dura 1 ano e a API não renova.** O campo `consentExpiresAt` do item vira
  dias restantes no painel, com aviso a partir de 30 dias. Para renovar, repita o
  *Connect Account* no dashboard da Pluggy. Se vencer, as leituras voltam vazias e o
  update falha com `USER_AUTHORIZATION_EXPIRED` — sem erro barulhento, o que é justamente
  o jeito ruim de descobrir. Daí o aviso.
- **O consentimento de cada banco é separado** do grant da aplicação e vence no prazo dele.
- **Atualização é de 24h** e o item não aceita update manual: sincronizar de hora em hora
  não traz nada novo.
- **Limite de 5 conexões** e uso pessoal. Se um dia isso virar produto para cliente, muda
  de patamar: o piso dos planos comerciais da Pluggy fica na casa dos milhares por mês.

## Endpoints

Todos sob `/api`, com `authorization: Bearer <APP_TOKEN>`.

| Rota | Método | Função |
|---|---|---|
| `/overview?from=&to=` | GET | totais, por categoria, por mês, por conta, maiores saídas, recorrentes |
| `/transactions?from=&to=&q=&category=&account=&transfers=1&limit=&offset=` | GET | lista paginada |
| `/transactions/:id` | PATCH | `{category, is_transfer}` — marca como manual |
| `/sync?mode=full` | POST | sincroniza; `full` refaz a carga histórica |
| `/recategorize?offset=` | POST | reaplica regras em lotes de 2000 |
| `/rules` | GET / POST | lista e cria regra |
| `/rules/:id` | DELETE | remove regra |
| `/accounts` | GET | contas e cartões com saldo e limite |
| `/health` | GET | status dos itens, dias de autorização restantes, últimos syncs |
| `/manual/accounts` | GET / POST | créditos por fora com dívida, limite disponível e próximas faturas / cria |
| `/manual/accounts/:id` | PATCH / DELETE | edita / remove o crédito e os lançamentos dele |
| `/manual/transactions` | POST | `{account_id, entries:[{date, description, amount, kind, installments \| installment:[x,y], category}]}` |
| `/manual/transactions/:id?group=1` | DELETE | apaga um lançamento manual (`group=1`: todas as parcelas da compra) |

## Nota honesta

Escrevi isso contra a documentação atual da Pluggy, sem credenciais para rodar de verdade.
O contrato de `/auth`, `/items/{id}`, `/accounts?itemId=` e `/v2/transactions` (paginação
por cursor, seguindo o campo `next`) está conforme a doc. Se o primeiro sync reclamar de
algum campo, o erro vem com método, rota, status e corpo da resposta — me manda que eu
ajusto na hora.
