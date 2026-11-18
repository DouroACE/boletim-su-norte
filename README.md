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
| Excel de afluência ao SU (equipa) | Afluência diária ao SU (idades, diagnósticos, internamento, origem, temperatura), carregada todas as semanas no Boletim | Semanal, só no browser |

Os dados da equipa não entram no repositório: o Excel do SU (Boletim) e o modelo semanal (Relatórios) são lidos só no browser e ficam guardados nesse browser.

## Páginas

- **Boletim** (`/`): dados públicos atualizados sozinhos (situação da ULSSA, indicadores mensais, meteorologia, ambiente, mortalidade) e o **boletim da semana**, montado quando a equipa carrega o Excel do SU: síntese e flags da IA, indicadores, padrões e gráficos. Também importa dados de boletins passados com métricas padronizadas. Imprimir / PDF e Excel do período.
- **Workspace** (`/workspace`): estudos com todos os dados (semanas do SU, matriz da DE-SNS, histórico de boletins passados e séries públicas): até 6 variáveis no mesmo gráfico, correlações, notas da IA guardadas com cada estudo.
- **Comunicação** (`/comunicacao`): a partir do boletim da semana ou de um estudo guardado, a IA redige rascunhos de comunicado à população, comunicado interno ou estratégias de controlo e execução (`aiComunicado`). Inclui os textos de alerta do procedimento da USP.
- **Relatórios DE-SNS** (`/relatorios`): a Monitorização Semanal para a DE-SNS a partir do modelo semanal em Excel.

Os endereços antigos (`/painel`, `/alertas`, `/flags-ia`, `/exportar`, `/analise`) redirecionam para estas páginas. Nada do que a equipa carrega vai para o servidor: à IA chegam só indicadores ou textos agregados.

## Níveis e alertas

- **Situação da ULSSA**: o nível mais alto entre a procura do SU e a ocupação (níveis DGS: 1 → Atenção; 2 e 3 → Alerta), os avisos IPMA do distrito do Porto e o índice FRIESA. Os indicadores regionais não entram.
- **Procura do SU**: variação dos atendimentos mensais face ao mesmo mês do ano anterior; níveis DGS 10 %, 25 % e 50 %.
- **Ocupação**: níveis DGS 85 %, 95 % e 105 %.
- **Óbitos SICO e regionais**: teste de Poisson face ao mesmo mês do ano anterior. Um mês que a SPMS repete na publicação fica "a rever".
- **Linha de base sazonal** (regional, `lib/stats.ts`): média dos últimos 7 dias face às 5 épocas anteriores. z ≥ 1 dá **Atenção** e z ≥ 2 dá **Alerta**.
- **IA** (`lib/ai.ts`): Llama 3.3 70B (Groq) ou Qwen 2.5 72B (Hugging Face) recebe só os números já calculados e redige a síntese. A IA não decide níveis. Sem chave, o texto é gerado por regras.

## Dados partilhados da equipa (Supabase)

Projeto Supabase «Saude_Publica» (região UE, Frankfurt). Sem entrar, a app guarda tudo só no browser. Em **Entrar (equipa)** no menu escreve-se o **código da equipa** (sem e-mail): o browser abre uma sessão anónima e a base confirma o código; a partir daí os dados (semanas do SU, boletim da semana, matriz da DE-SNS, histórico, estudos) são lidos e gravados também na tabela `partilhado`, e todos os que entraram veem o mesmo (`lib/partilha.ts`). Os ficheiros continuam a ser lidos no browser: só os dados agregados vão para a base.

- Definir ou mudar o código (SQL Editor do Supabase; mínimo 12 caracteres): `select public.definir_codigo_equipa('…');`. O código não está no repositório; a base guarda só o hash (bcrypt).
- Tirar o acesso a todos os que já entraram (depois de mudar o código): `delete from public.membros;`.
- Regras de acesso (RLS): `supabase/migrations/`. Sem ter entrado com o código, não se lê nem escreve; a chave publicável e o endereço da base são públicos (estão no repositório), por isso a proteção é o código, não o link.
- Também é possível dar acesso por e-mail (`public.equipa`), se um dia se configurar um SMTP.

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

## Boletim da semana (todas as semanas)

Os dados públicos atualizam-se sozinhos. Os do serviço de urgência não são públicos: a equipa carrega no Boletim o Excel de afluência ao SU (uma linha por dia; `lib/su-ficheiro.ts`). O ficheiro é lido e guardado só nesse browser; os dias novos juntam-se aos anteriores. A última semana é comparada com as 8 anteriores (`lib/su-semana.ts`: z ≥ 1 Atenção, z ≥ 2 Alerta) e a IA (`aiFlagsSU`) recebe só esses indicadores agregados, propõe flags e uma síntese; o nível vem sempre das regras. O boletim da semana fica guardado no browser para a página Comunicação.

## Ficheiro semanal da ULSSA

Um ficheiro por semana (segunda a domingo), descarregado em [/api/modelo-semanal](/api/modelo-semanal). Cada equipa preenche só a coluna Valor da sua folha; a folha «Indicadores diários» leva uma linha por dia e aceita colunas extra com números. Só totais agregados. A leitura (`lib/semanal.ts`) avisa de campos vazios ou inválidos; não há envio para o servidor.

## Desenvolvimento

```bash
npm install
npm run dev
npx tsc --noEmit
node scripts/selfcheck-uls.mjs        # lógica por ULS, DGS, faixa mensal, ar/pólen/UV e flags de IA
node scripts/selfcheck-semanal.mjs    # modelo semanal → Excel → leitura, e tabelas do Workspace
node scripts/selfcheck-historico.mjs  # padronização das métricas de boletins passados
node scripts/selfcheck-su-semana.mjs  # indicadores semanais do SU e validação das flags de IA
npm run build
```

Dependências sem vulnerabilidades conhecidas. O `postcss` usado pelo Next.js é forçado para a versão corrigida via `overrides`.

Sistema de design: Roboto, azul e amarelo da Saúde Sazonal da ULSSA, tokens com modo escuro e contraste AA.
