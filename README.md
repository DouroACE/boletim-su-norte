# Boletim de Vigilância Sazonal · Urgência · Região Norte

Página web viva (Next.js na Vercel) que junta os dados locais do Serviço de Urgência (Excel) a fontes públicas e gratuitas. A recolha é automática: a página volta a buscar os dados de 30 em 30 minutos a 3 em 3 horas (ISR da Next.js), sem servidor nem custos.

## Fontes de dados (todas públicas)

| Fonte | O que traz | Frequência |
|---|---|---|
| SNS Transparência · `atividade-sindrome-gripal-csh` | Episódios de urgência estimados, % com infeção respiratória, tempo triagem→1.ª observação, não urgentes/100 000 hab. (ARS Norte) | Diária |
| SNS Transparência · `monitorizacao-sazonal-csh` | % de urgências com internamento (ARS Norte) | Diária |
| SNS Transparência · `indice-friesa` | Índice de impacto do frio, Porto (geral e 65+) — INSA | Diária (nov–mar) |
| SNS Transparência · `evolucao-diaria-do-indice-icaro` | Índice de impacto do calor — INSA | Diária (mai–set) |
| SNS Transparência · `evolucao-diaria-de-certificados-de-obito` | Óbitos certificados por dia (SICO), Portugal | Diária |
| SNS Transparência · `atendimentos-em-urgencia-triagem-manchester` | Atendimentos mensais por cor de triagem, ULS Santo António | Mensal |
| SNS Transparência · `certificados-de-obito-por-instituicao-de-saude` | Óbitos certificados (SICO) por instituição, somados por ULS do Norte (mapa) | Mensal |
| SNS Transparência · `atendimentos-por-tipo-de-urgencia-hospitalar-link` | Atendimentos em urgência por ULS (mapa; acumulados no ano, convertidos em mensais) | Mensal |
| SNS Transparência · `atendimentos-em-urgencia-triagem-manchester` (todas as ULS do Norte) | % de triagem vermelha + laranja por ULS (mapa) | Mensal |
| IPMA API aberta | Previsão diária para o Porto e avisos meteorológicos dos distritos do Norte | Horária |
| Open-Meteo | Temperatura e precipitação observadas (45 dias) e previstas no Porto | Horária |
| `data/su-local.xlsx` | Afluência diária ao SU (idades, diagnósticos, internamento, origem, temperatura, ÍCARO) | Manual |

## Alertas ("flags") e padrões

- **Estatística** (`lib/stats.ts`): a média dos últimos 7 dias é comparada com a linha de base das 5 épocas anteriores para a mesma altura do ano (±7 dias). z ≥ 1 dá **Atenção** e z ≥ 2 dá **Alerta**.
- **Dados locais** (`lib/local.ts`): semana de pico, pico respiratório, dias anómalos (média + 2 DP por dia da semana), correlação temperatura ↔ infeções respiratórias com desfasamento, padrão semanal e idosos.
- **IA open-source** (`lib/ai.ts`): Llama 3.3 70B (Groq, gratuito) ou Qwen 2.5 72B (Hugging Face, gratuito) recebe só os números calculados e redige a síntese. A IA **não decide** os níveis de alerta. Sem chave configurada, o texto é gerado por regras.

## Mapa por ULS

Secção `#mapa` da página principal: um mapa (Leaflet + OpenStreetMap) e uma tabela com as 14 ULS da Região Norte. Para cada ULS mostra o último mês publicado de óbitos SICO e de urgências, comparado com o mesmo mês do ano anterior.

- **Óbitos (SICO):** teste de Poisson face ao mês homólogo. **Atenção** se z ≥ 2, **Alerta** se z ≥ 3. Conta só os certificados emitidos nas unidades da ULS (sobretudo óbitos hospitalares), não a residência.
- **Urgências:** **Atenção** a partir de +10 %, **Alerta** a partir de +20 % face ao mês homólogo.
- **Limite:** não há dados públicos diários por ULS. A SPMS publica o SICO por instituição e as urgências por ULS só uma vez por mês, com atraso.

## Flags de IA (`/flags-ia`)

O modelo (Groq/Hugging Face, as mesmas chaves da síntese) recebe a tabela de indicadores regionais e por ULS e propõe até 8 flags. Cada flag tem de citar os ids dos indicadores em que se baseia. O código descarta as flags que citem indicadores inexistentes, e o nível de cada flag é sempre o pior nível estatístico dos indicadores citados, nunca o da IA. Sem chave configurada, a página mostra as flags das regras. A tabela exata enviada ao modelo fica visível no fim da página.

## Filtro de datas

As duas páginas aceitam `?de=AAAA-MM-DD&ate=AAAA-MM-DD`, com atalhos para 7, 30 e 90 dias e para a época atual ou anterior. Sem filtro, mostram o estado atual (últimos 7 dias contra a linha de base sazonal). Com filtro, cada indicador compara a média do período com a média do **mesmo período nos 5 anos anteriores** (um único z por período, para não multiplicar falsos alertas em períodos longos). O mapa por ULS usa o último mês publicado até à data final, e as flags de IA analisam esse período. Os avisos do IPMA só aparecem quando o período inclui hoje, porque o IPMA não publica histórico.

## Plano de dados (Plano Sazonal DGS 2026–2027)

[`docs/plano-dados-boletim.md`](docs/plano-dados-boletim.md) faz o levantamento das métricas do Plano Nacional de Preparação e Resposta Sazonal em Saúde 2026–2027: níveis de risco 0–3, fontes do Anexo 2 e o que é público ou tem de ser pedido. Inclui também a arquitetura e as fases para a webapp gerar os boletins semanais sozinha.

## Atualização diária

O `vercel.json` agenda um cron diário (07:00 UTC) para `/api/revalidate`. A rota invalida o cache de todas as fontes (`revalidateTag`) e das duas páginas, e a visita seguinte volta a recolher tudo. Isto soma-se ao ISR de 3 em 3 horas. A rota exige `CRON_SECRET`, que a Vercel envia automaticamente ao cron quando a variável está configurada.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `GROQ_API_KEY` | não | Chave gratuita em console.groq.com — ativa a síntese por IA |
| `HF_TOKEN` | não | Alternativa: token gratuito do Hugging Face |
| `GROQ_MODEL` / `HF_MODEL` | não | Trocar de modelo |
| `CRON_SECRET` | sim, para o cron | Texto aleatório (ex.: `openssl rand -hex 32`); protege `/api/revalidate` |
| `REGIAO_ARS` | não | Por omissão `ARS Norte` |
| `INSTITUICAO_SNS` | não | Por omissão `Unidade Local de Saúde de Santo António, EPE` |

## Atualizar os dados locais

1. Substituir `data/su-local.xlsx` por um Excel com as mesmas colunas (no GitHub: *Add file → Upload files*).
2. A Vercel volta a construir a página; o script `scripts/import-excel.mjs` converte o Excel em JSON automaticamente.

## Desenvolvimento

```bash
npm install
npm run dev
node scripts/selfcheck-uls.mjs   # verificação da lógica por ULS e da validação das flags de IA
```

Dependências sem vulnerabilidades conhecidas (`npm audit`: 0). O `postcss` usado pelo Next.js é forçado para a versão corrigida via `overrides`.

O sistema de design (Swiss minimal, Atkinson Hyperlegible, tokens com modo escuro e contraste AA) foi gerado com a skill `ui-ux-pro-max`.
