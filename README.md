# Boletim de Vigilância Sazonal · ULS Santo António

Página web viva (Next.js na Vercel) para a vigilância sazonal da **ULS Santo António**, que cobre o concelho de **Gondomar** e a zona ocidental do **Porto** (ACeS Porto Ocidental). Junta os dados do Serviço de Urgência (Excel da equipa) a fontes públicas e gratuitas. A recolha é automática: a página volta a buscar os dados de 3 em 3 horas (ISR da Next.js), sem servidor próprio.

O desenho do projeto (território, níveis de risco, páginas e fontes) está em [`docs/estrutura-ulssa.md`](docs/estrutura-ulssa.md).

## Fontes de dados (todas públicas)

| Fonte | O que traz | Frequência |
|---|---|---|
| SNS Transparência · `atendimentos-por-tipo-de-urgencia-hospitalar-link` | Atendimentos em urgência, ULS Santo António (acumulados no ano, convertidos em mensais) | Mensal |
| SNS Transparência · `atendimentos-em-urgencia-triagem-manchester` | Atendimentos por cor de triagem, ULS Santo António | Mensal |
| SNS Transparência · `ocupacao-do-internamento` | Taxa de ocupação hospitalar, ULS Santo António (dias de internamento ÷ lotação × dias) | Mensal |
| SNS Transparência · `evolucao-das-consultas-medicas-nos-csp` | Consultas médicas presenciais e não presenciais, ULS Santo António | Mensal |
| SNS Transparência · `certificados-de-obito-por-instituicao-de-saude` | Óbitos certificados (SICO) nas unidades da ULS Santo António | Mensal |
| SNS Transparência · `evolucao-diaria-de-certificados-de-obito` | Óbitos certificados por dia, Portugal (SICO) | Diária |
| DGS · eVM (`evm.min-saude.pt`) | Óbitos diários da Região Norte, até ontem. Não há série diária pública por ACeS | Diária |
| SNS Transparência · `indice-friesa`, `evolucao-diaria-do-indice-icaro` | Índices FRIESA (frio, Porto) e ÍCARO (calor), INSA | Diária |
| IPMA (API aberta) | Avisos do distrito do Porto (inclui Gondomar) e previsão para o Porto | Horária |
| Open-Meteo | Temperatura e UV (Porto e Gondomar); qualidade do ar (PM10, PM2,5, ozono) e pólen | Horária |
| `data/su-local.xlsx` | Afluência diária ao SU (idades, diagnósticos, internamento, origem, temperatura) | Manual |

Os dados da equipa (ficheiros de mortalidade, alertas e afluência) não entram no repositório: são carregados no browser, na página Vigilância da equipa.

## Páginas

- **Boletim** (`/`): situação da ULSSA, indicadores mensais, meteorologia e ambiente, mortalidade, dados locais do SU e, colapsado, o contexto regional (ARS Norte).
- **Painel de risco** (`/painel`): nível 0–3 do Plano Sazonal 2026–2027 (DGS, p. 20) com a procura do SU e a ocupação da ULSSA, e faixa dos últimos 12 meses publicados.
- **Flags de IA** (`/flags-ia`): sinais propostos por um modelo de linguagem a partir dos indicadores da ULSSA, FRIESA, óbitos regionais e avisos do Porto.
- **Exportar** (`/exportar`): Excel com as variáveis escolhidas e o período (`/api/exportar`).
- **Relatórios** (`/relatorios`): registo semanal para a DE-SNS, com texto e tabela para copiar e histórico por período. Fica só no browser; exporte cópias `.json`.

## Níveis e alertas

- **Situação da ULSSA**: o nível mais alto entre a procura do SU e a ocupação (níveis DGS: 1 → Atenção; 2 e 3 → Alerta), os avisos IPMA do distrito do Porto e o índice FRIESA. Os indicadores regionais não entram.
- **Procura do SU**: variação dos atendimentos mensais face ao mesmo mês do ano anterior; níveis DGS 10 %, 25 % e 50 %.
- **Ocupação**: níveis DGS 85 %, 95 % e 105 %.
- **Óbitos SICO e regionais**: teste de Poisson face ao mesmo mês do ano anterior. Um mês que a SPMS repete na publicação fica "a rever".
- **Linha de base sazonal** (regional, `lib/stats.ts`): média dos últimos 7 dias face às 5 épocas anteriores. z ≥ 1 dá **Atenção** e z ≥ 2 dá **Alerta**.
- **IA** (`lib/ai.ts`): Llama 3.3 70B (Groq) ou Qwen 2.5 72B (Hugging Face) recebe só os números já calculados e redige a síntese. A IA não decide níveis. Sem chave, o texto é gerado por regras.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `GROQ_API_KEY` | não | Chave gratuita em console.groq.com: ativa a síntese por IA |
| `HF_TOKEN` | não | Alternativa: token gratuito do Hugging Face |
| `GROQ_MODEL` / `HF_MODEL` | não | Trocar de modelo |
| `CRON_SECRET` | sim, para o cron | Texto aleatório (ex.: `openssl rand -hex 32`); protege `/api/revalidate` |
| `REGIAO_ARS` | não | Região do contexto regional. Por omissão `ARS Norte` |
| `INSTITUICAO_SNS` | não | Instituição da triagem de Manchester. Por omissão `Unidade Local de Saúde de Santo António, EPE` |

## Atualização diária

O `vercel.json` agenda um cron diário (07:00 UTC) para `/api/revalidate`. A rota invalida o cache de todas as fontes e das páginas, e a visita seguinte volta a recolher tudo. Isto soma-se ao ISR de 3 em 3 horas. A rota exige `CRON_SECRET`.

## Atualizar os dados locais

1. Substituir `data/su-local.xlsx` por um Excel com as mesmas colunas.
2. A Vercel volta a construir a página; o script `scripts/import-excel.mjs` converte o Excel em JSON.

## Ficheiro mensal da ULSSA

Modelo para a equipa: [/api/modelo-mensal](/api/modelo-mensal) descarrega um Excel em branco com as 5 folhas (SU_diario, SU_diagnosticos, Internamento, CSP_mensal, CSP_ICPC2) e as instruções. Um ficheiro por mês, só com totais; "<5" é aceite para contagens pequenas. Na página Vigilância da equipa, o ficheiro é lido só no browser e os meses juntam-se por data (o mais recente ganha em datas repetidas). Não há armazenamento nem envio para o servidor.

## Desenvolvimento

```bash
npm install
npm run dev
npx tsc --noEmit
node scripts/selfcheck-uls.mjs   # verificação da lógica por ULS, DGS, faixa mensal, ar/pólen/UV e flags de IA
npm run build
```

Dependências sem vulnerabilidades conhecidas. O `postcss` usado pelo Next.js é forçado para a versão corrigida via `overrides`.

Sistema de design: Atkinson Hyperlegible, tokens com modo escuro e contraste AA.
