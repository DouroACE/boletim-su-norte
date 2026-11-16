# Plano de dados para a geração automática dos boletins

Alinhado com o **Plano Nacional de Preparação e Resposta Sazonal em Saúde 2026–2027** (DGS / DE-SNS, Portaria n.º 136/2026/1). Objetivo: a webapp gerar sozinha, todas as semanas, o relatório de vigilância e o **nível de risco (0–3)** da Região Norte e de cada ULS, com os mesmos indicadores que o Plano usa.

---

## 1. O que o Plano exige (e o que isso significa para a webapp)

| O Plano diz | Página | O que a webapp tem de fazer |
|---|---|---|
| Relatório de vigilância **semanal**, que integra meteorologia, ambiente, saúde humana e animal, sistemas de vigilância (indicadores, eventos, sentinela), fontes epidemiológicas e laboratoriais, agentes (respiratórios, vetores, água e alimentos), níveis de cuidados (pré-hospitalar, CSP, CSH) e mortalidade | 7.2.4 | Página `/boletim/AAAA-Snn` gerada à segunda-feira, com estas secções e um registo guardado para histórico |
| **4 níveis de risco**: 0 Verde, 1 Amarelo, 2 Laranja, 3 Vermelho, com indicadores e limiares assistenciais | 7.2.2, tabela p. 20 | Motor de regras com os limiares da tabela, por ULS e para a região |
| As ULS podem ter um nível diferente do nacional, de forma fundamentada | 7.2.2 | O nível é calculado **por ULS**, e cada indicador mostra a justificação |
| Fenómenos a vigiar: calor, frio, qualidade do ar e da água, vetores, infeções respiratórias, doenças crónicas, procura de cuidados, gravidade (camas, UCI, mortalidade e excesso de mortalidade), acidentes, incêndios | 7.2.1 | Uma secção do boletim por fenómeno |
| Avaliação intercalar a **31/10**, provisória a **15/03**, final a **31/05** (local) e **30/06** (nacional) | 12, 13 | Relatórios de avaliação gerados a partir dos boletins semanais guardados |

### Tabela de níveis de risco (p. 20), traduzida em métricas

| Indicador | Nível 1 | Nível 2 | Nível 3 |
|---|---|---|---|
| Aumento da procura do SU | ≥ 10 % e < 25 % | ≥ 25 % e < 50 % | ≥ 50 % |
| Aumento dos dias de *boarding* no SU | ≥ 10 % e < 20 % | ≥ 20 % e < 30 % | ≥ 30 % |
| Aumento do tempo médio de espera no SU (urgentes e muito urgentes) | ≥ 20 % e < 40 % | ≥ 40 % e < 60 % | ≥ 60 % |
| Taxa de ocupação hospitalar | ≥ 85 % e < 95 % | ≥ 95 % | ≥ 105 % |
| Ocupação dos serviços de Medicina | — | ≥ 100 % | — |
| Aumento da procura da consulta aberta nos CSP | ≥ 15 % e < 30 % | ≥ 30 % e < 45 % | ≥ 45 % |
| Hora a que esgotam as vagas da consulta aberta | antes das 12:00 | antes das 10:30 | antes das 09:00 |

Também há **critérios críticos** qualitativos, como "dificuldade severa de garantir resposta assistencial" ou "esgotamento da área física livre do SU". Estes não se calculam: entram como **declaração manual da Equipa Local** (ver secção 4).

> **Decisão a tomar:** o Plano fala em "aumento", mas não diz face a quê. Proposta: comparar a média dos últimos 7 dias com o **mesmo período nos 5 anos anteriores**, o mesmo método do novo filtro de datas da webapp. Alternativa: comparar com a semana anterior. Convém confirmar com a Autoridade de Saúde/DGS antes de pôr em produção.

---

## 2. Matriz de métricas: o que existe, onde está e como obter

Legenda do estado:
- ✅ já integrado na webapp
- 🟢 público, só falta integrar (testado em 16/11/2026)
- 🟡 público mas com limitações
- 🔴 não é público: precisa de pedido ou acordo institucional

### 2.1 Indicadores assistenciais (os que definem o nível de risco)

| Métrica | Fonte (Anexo 2) | Granularidade disponível | Estado |
|---|---|---|---|
| Afluência ao SU | SNS Transparência `atividade-sindrome-gripal-csh` | Diária, **só ARS Norte** | ✅ |
| Afluência ao SU por ULS | SNS Transparência `atendimentos-por-tipo-de-urgencia-hospitalar-link` | **Mensal**, acumulada no ano | ✅ (mensal) |
| Afluência ao SU por ULS, **diária** | ULS (sistema de urgência / BI) ou SIM@SNS / BI-SNS (SPMS) | Diária | 🔴 |
| Dias de *boarding* no SU | ULS (gestão de doentes / camas) | Diária | 🔴 |
| Tempo de espera, urgentes e muito urgentes | Portal TEMPOS (SPMS): só painel Power BI, sem API | Tempo real | 🔴 (pedir exportação à SPMS) |
| Tempo triagem → 1.ª observação | SNS Transparência (ARS) | Diária | ✅ (aproximação) |
| Triagem de Manchester por ULS | SNS Transparência `atendimentos-em-urgencia-triagem-manchester` | Mensal | ✅ |
| Ocupação hospitalar e de Medicina | ULS (gestão de camas) | Diária | 🔴 |
| Procura da consulta aberta CSP e hora a que esgotam as vagas | SIM@SNS (ACSS/SPMS) ou ULS (CSP) | Diária | 🔴 |
| Internamentos | SNS Transparência `monitorizacao-sazonal-csh` (% com internamento) | Diária, ARS | ✅ |
| Pré-hospitalar (INEM) | INEM | Diária | 🔴 |
| SNS 24 | SNS Transparência `atividade-operacional-do-sns-24` | **Mensal**, nacional, só métricas de chamadas (sem triagens por motivo) | 🟡 |

### 2.2 Indicadores epidemiológicos

| Métrica | Fonte | Granularidade | Estado |
|---|---|---|---|
| % de urgências com infeção respiratória | SNS Transparência (ARS) | Diária | ✅ |
| Gripe, VSR e SARS-CoV-2: positividade e incidência (sentinela) | INSA, Boletim da Gripe e outros vírus respiratórios | Semanal (portal/PDF) | 🟡 (sem API: extrair do portal ou pedir ficheiro ao INSA) |
| Dados europeus (ECDC ERVISS) | Repositório público do ECDC | Semanal | 🟡 (os ficheiros principais não tinham semanas recentes de Portugal; confirmar antes de usar) |
| Internamentos em UCI por gripe | Rede de vigilância da gripe em UCI (DGS) | Semanal | 🔴 |
| Doenças de declaração obrigatória | SINAVE (DGS) | Diária | 🔴 (só agregados, via Autoridade de Saúde) |
| Cobertura vacinal antigripal | SNS Transparência `taxa-de-cobertura-da-vacina-antigripal-sazonal-...` | Por época | 🟢 |
| Vetores (REVIVE) | INSA/DGS | Relatórios | 🔴 / manual |

### 2.3 Mortalidade

| Métrica | Fonte | Granularidade | Estado |
|---|---|---|---|
| Óbitos diários | SICO, via SNS Transparência | Diária, nacional | ✅ |
| Óbitos por ULS | SICO por instituição, via SNS Transparência | Mensal, pelo local de certificação | ✅ |
| Óbitos por residência (concelho/ULS) e **excesso de mortalidade** | SICO / eVM (DGS) | Diária | 🔴 (pedir à DGS um extrato diário agregado por concelho e grupo etário) |
| Índices FRIESA (frio) e ÍCARO (calor) | INSA, via SNS Transparência | Diária, sazonal | ✅ |

### 2.4 Meteorologia e ambiente

| Métrica | Fonte | Granularidade | Estado |
|---|---|---|---|
| Avisos meteorológicos por distrito | IPMA (API aberta) | Tempo real | ✅ |
| Previsão de temperatura | IPMA (API aberta) | Diária, por cidade | ✅ (Porto). Alargar às capitais de distrito das ULS |
| Temperatura observada | Open-Meteo | Diária, por coordenadas | ✅ (Porto). Alargar às coordenadas de cada ULS |
| Qualidade do ar: PM10, PM2,5, ozono | Open-Meteo Air Quality (modelo CAMS); a referência oficial é a APA (QualAr) | Horária | 🟢 (Open-Meteo testado) |
| Pólen | Open-Meteo Air Quality (CAMS); a referência é IPMA / Rede Portuguesa de Aerobiologia | Horária | 🟢 |
| Incêndios rurais | fogos.pt (dados da ANEPC) | Tempo real | 🟢 |
| Seca e restrições à água / prática balnear | APA (`infoagua`, restrições balneares) | Variável | 🟡 (páginas, sem API estável) |

### 2.5 Denominadores

| Métrica | Fonte | Estado |
|---|---|---|
| População residente por concelho e idade, agregada por ULS | INE (API de indicadores) e RNU (ACSS) | 🟢 (INE). Permite taxas por 100 000 hab. e comparar ULS de tamanhos diferentes |

---

## 3. O que falta é sobretudo dado assistencial das ULS

Os indicadores que **definem o nível de risco** (boarding, ocupação, tempos por prioridade, consulta aberta) **não são públicos**. Sem eles, a webapp só consegue calcular um nível parcial, baseado na procura do SU. Há três caminhos, por ordem de esforço:

1. **Ficheiro diário por ULS (começar já).** Um modelo CSV/Excel fixo, preenchido ou exportado por cada ULS todos os dias e carregado na webapp. É o mesmo mecanismo que já existe para `data/su-local.xlsx`.
   Colunas propostas: `data`, `uls`, `episodios_su`, `episodios_su_urgentes_muito_urgentes`, `tempo_medio_espera_urgentes_min`, `doentes_boarding`, `dias_boarding`, `camas_ocupadas`, `camas_disponiveis`, `ocupacao_medicina_pct`, `consulta_aberta_atendimentos`, `consulta_aberta_hora_esgotamento`, `criterio_critico` (texto livre, opcional).
2. **Exportação automática do BI da ULS.** A mesma tabela, enviada por um processo noturno (SFTP, e-mail para uma caixa dedicada, ou chamada à API da webapp com chave).
3. **Acordo com a DE-SNS/SPMS** para aceder aos agregados diários do SIM@SNS, do TEMPOS e do BI-SNS para todas as ULS do Norte. O Plano prevê esta partilha (secção 4, "monitorização dos indicadores relevantes") e o cronograma (p. 42) atribui à SPMS o desenvolvimento dos sistemas de informação.

### Pedidos de dados a fazer

| A quem | O quê | Frequência |
|---|---|---|
| Conselho de Administração / Equipa Local de cada ULS | Ficheiro diário com as colunas acima (ou acesso ao BI) | Diário |
| SPMS | Exportação dos tempos de espera por prioridade (TEMPOS) por SU | Diário |
| ACSS / SPMS | Consulta aberta CSP por ULS (SIM@SNS) | Diário |
| DGS | SICO diário agregado por concelho de residência e grupo etário; excesso de mortalidade (eVM); UCI gripe | Diário / semanal |
| INSA | Dados do Boletim da Gripe em ficheiro (CSV) | Semanal |
| INEM | Ocorrências pré-hospitalares por concelho | Diário |

---

## 4. Como a webapp gera o boletim sozinha (arquitetura)

```
Fontes públicas ──┐
Ficheiros ULS ────┼─► Recolha diária (cron 07:00) ─► Tabela de métricas diárias por ULS
Pedidos (DGS…) ───┘                                  │
                                                     ▼
                          Motor de níveis (tabela p. 20) + z-scores sazonais
                                                     │
                       ┌─────────────────────────────┼──────────────────────────┐
                       ▼                             ▼                          ▼
              Boletim semanal              Flags (regras + IA)        Avaliações 31/10, 15/03, 31/05
         (/boletim/AAAA-Snn, guardado)   (/flags-ia, já existe)     (a partir dos boletins guardados)
```

1. **Recolha:** um conector por fonte em `lib/sources.ts` (o padrão que já existe). O cron diário (`/api/revalidate`) já invalida o cache.
2. **Tabela de métricas:** uma linha por `data × ULS × métrica`, com a fonte e a hora de recolha. Para guardar histórico, a webapp precisa de armazenamento persistente (por exemplo Postgres via Vercel Marketplace, ou ficheiros JSON em Vercel Blob). Hoje vai buscar tudo à fonte em cada pedido.
3. **Motor de níveis:** a tabela da secção 1 como regras. O nível da ULS é o **mais alto** atingido por qualquer indicador, e cada nível guarda a justificação ("procura do SU +27 % → nível 2"). Os critérios críticos entram como declaração manual da Equipa Local e sobrepõem-se ao cálculo.
4. **Boletim semanal:** à segunda-feira, uma página com as secções do 7.2.4, a síntese em texto pela IA (só a partir dos números, como já acontece) e uma versão para imprimir/PDF. Cada boletim fica guardado: é isto que alimenta as avaliações intercalar e final.
5. **Filtro de datas:** já está na webapp (`?de=&ate=`). Serve para rever qualquer período, por exemplo o inverno anterior para o relatório de avaliação.

---

## 5. Fases

| Fase | Duração indicativa | Entregáveis |
|---|---|---|
| **1. Só dados públicos** | 1–2 semanas | Temperatura, qualidade do ar e pólen por ULS (Open-Meteo); incêndios (fogos.pt); população INE e taxas por 100 000; cobertura vacinal; nível de risco parcial, só pela procura do SU; primeiro boletim semanal gerado e guardado |
| **2. Dados das ULS** | 2–4 semanas (depende dos pedidos) | Modelo de ficheiro diário, upload na webapp com validação, motor de níveis completo com a tabela p. 20, níveis por ULS no mapa |
| **3. Dados nacionais** | Depende de acordos | SICO por residência e excesso de mortalidade, TEMPOS, SIM@SNS, UCI gripe, INSA |
| **4. Avaliação** | Antes de 15/03/2027 | Relatório provisório gerado a partir dos boletins guardados; relatório de avaliação local até 31/05/2027 |

---

## 6. Cuidados e limitações

- **Linha de base:** as épocas 2020/21 e 2021/22 (COVID-19) entram na comparação com os 5 anos anteriores e podem baixar ou subir o esperado. Considerar excluí-las ou assinalá-las.
- **Dados provisórios:** o SNS Transparência revê valores. O boletim guardado deve registar a data de recolha de cada número.
- **Óbitos por ULS:** o SICO por instituição conta o local de certificação (sobretudo hospitalar), não a residência. Para excesso de mortalidade por ULS é preciso o extrato por residência da DGS.
- **Dados pessoais:** o boletim deve usar só **agregados** (por dia e ULS, com mínimo de células, por exemplo ≥ 5). Os ficheiros das ULS não devem trazer dados individuais.
- **IA:** a IA redige e sugere padrões, mas o nível de risco é sempre das regras. Cada boletim gerado deve ser validado pela Equipa Local antes de ser divulgado ("por validar").
