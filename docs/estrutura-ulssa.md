# Estrutura do projeto — Saúde Sazonal · ULS Santo António

Base: Plano Local de Preparação e Resposta Sazonal em Saúde (PLPRSS) 2026–2027 da ULS Santo António (atualização de 27/10/2026), Plano Nacional 2026–2027 (DGS / DE-SNS, Portaria n.º 136/2026/1), relatórios de avaliação 2024–2026, procedimento de alertas (Verão 2025) e propostas da equipa de saúde sazonal.

> O repositório é público. Contactos, relatórios internos e ficheiros de dados da equipa **não entram no repositório**. Os dados da equipa são carregados no browser (página Vigilância/Análise) e nunca saem dele; só resumos agregados podem seguir para a IA.

## 1. Território

| Componente | Unidades |
|---|---|
| Hospitalar | Hospital de Santo António, Hospital de Magalhães Lemos, Centro Materno-Infantil do Norte Albino Aroso |
| Cuidados de saúde primários | ACeS Gondomar, ACeS Porto Ocidental |
| Saúde pública | USP com polos em Gondomar e no Porto Ocidental |
| Concelhos | **Gondomar** (todo) e **Porto** (parte ocidental) |

Consequência: dados por concelho do Porto (INE, mortalidade semanal) cobrem também a área da ULS São João, por isso são aproximações. Para Gondomar coincidem.

## 2. Níveis de risco (0 Verde · 1 Amarelo · 2 Laranja · 3 Vermelho)

Critérios assistenciais iguais à tabela nacional (p. 20 do Plano Nacional; Tabelas 13 e 14 do PLPRSS):

| Indicador | Nível 1 | Nível 2 | Nível 3 | Fonte na ULSSA |
|---|---|---|---|---|
| Aumento da procura do SU | ≥10 % e <25 % | ≥25 % e <50 % | ≥50 % | SIG hospital (diário) |
| Aumento dos dias de *boarding* | ≥10 % e <20 % | ≥20 % e <30 % | ≥30 % | SIG hospital |
| Aumento do tempo de espera (urgentes e muito urgentes) | ≥20 % e <40 % | ≥40 % e <60 % | ≥60 % | SIG hospital / TEMPOS |
| Taxa de ocupação hospitalar | ≥85 % e <95 % | ≥95 % | ≥105 % | SIG / SNS Transparência (mensal) |
| Ocupação de Medicina | — | ≥100 % | — | SIG hospital |
| Aumento da procura da consulta aberta (CSP) | ≥15 % e <30 % | ≥30 % e <45 % | ≥45 % | SIG CSP |
| Vagas da consulta aberta esgotadas | antes das 12:00 | antes das 10:30 | antes das 09:00 | SIG CSP |

Regras próprias da ULSSA: desativação só após **48 h de remissão sustentada**; SAC com **>4 doentes/médico/hora** de forma persistente; época crítica nos CSP de 15/11 a 31/01 (20 % das consultas programadas passam a consulta aberta).

Decisões em aberto (o plano não define):
- Referência do "aumento": a app usa **o mesmo período do ano anterior, calculado a partir dos próprios dados carregados** (os relatórios usam a média diária do ano anterior). Configurável.
- Quantos indicadores bastam para ativar: a app mostra o **nível mais alto atingido** e lista os indicadores que o justificam; a decisão é da Equipa Local.

Sem limiar numérico (sinais de contexto): avisos IPMA, ÍCARO, FRIESA, qualidade do ar/água, ANEPC, mortalidade.

## 3. Páginas

| Página | Para quem | Dados | Estado |
|---|---|---|---|
| **Boletim** `/` | Profissionais, parceiros | Só fontes públicas da área da ULSSA: meteorologia Porto + Gondomar (temperatura, precipitação, UV, qualidade do ar, pólen), avisos IPMA (distrito do Porto), ÍCARO/FRIESA, mortalidade eVM, indicadores mensais da ULSSA (urgências, triagem, ocupação, CSP, SICO) | A reorientar |
| **Painel de risco** `/painel` | Equipa Local | Nível 0–3 com a tabela acima, faixa dos últimos 30 dias, medidas por nível | A reorientar |
| **Vigilância da equipa** `/analise` | Equipa de saúde sazonal | Ficheiros da equipa carregados no browser ("Vigilância Sazonal 2026", "Afluência ao SU"): reconhecidos automaticamente, com painel e correlações pré-definidas (temperatura → óbitos, temperatura → urgências respiratórias) | Base feita |
| **Alertas** `/alertas` | USP | Gerador de mensagens a partir de ÍCARO, avisos IPMA amarelo/laranja/vermelho e perigo máximo de incêndio: texto de e-mail, legenda para redes sociais, recomendações por público | A fazer |
| **Relatórios** `/relatorios` | Equipa Local | Registo semanal para a DE-SNS (11 campos, à segunda-feira), histórico dos níveis de risco para os relatórios intercalar (31/10) e final (31/05) | A fazer |
| Flags de IA, Exportar | Equipa | Indicadores da ULSSA | A reorientar |

Sai do foco: mapa e matriz das 14 ULS do Norte; indicadores da ARS Norte deixam de ser os principais (só contexto, identificados como regionais).

## 4. Fontes

| Fonte | Conteúdo | Frequência | Pública? |
|---|---|---|---|
| IPMA (API) | Avisos por distrito, previsão | Horária | Sim |
| Open-Meteo / CAMS | Temperatura, precipitação, UV, PM10, PM2,5, ozono, pólen por coordenadas | Horária | Sim |
| INSA (SNS Transparência) | ÍCARO, FRIESA Porto | Diária, sazonal | Sim |
| eVM (DGS) | Óbitos diários por região (Norte); por ACeS só na tabela interativa | Diária (até ontem) | Parcial |
| SNS Transparência | ULSSA: urgências, triagem, ocupação, lotação, CSP, SICO por instituição, morbilidade por diagnóstico | Mensal (1–3 meses de atraso; diagnóstico 4–5 meses) | Sim |
| Ficheiros da equipa | Mortalidade diária do ACeS Gondomar, temperaturas, UV, alertas, afluência diária ao SU por idade, diagnóstico e destino | Diária (manual) | Não — só no browser |
| SIG hospital / CSP, TEMPOS, SINAVE, VACINAS, SPCIRA | Indicadores de nível de risco em falta, vacinação, vírus respiratórios | Diária / semanal | Não — pedido institucional |

## 5. Qualidade dos dados da equipa (a validar)

Na folha "Vigilância": meses com erros de escrita ("Setembto"), um dia 31 de junho, uma linha com Ano = 0,59, "Terceira" por "Terça", Tmin = 105, dia 3 de novembro de 2026 duplicado. A app lê a data a partir de Ano/Mês/Dia e deixa vazias as datas impossíveis. Relatórios: 318 vs 333 episódios/dia no Inverno 2025-26; tempos de triagem com unidade provavelmente errada no Verão 2025.
