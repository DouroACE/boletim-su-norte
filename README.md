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
| IPMA API aberta | Previsão diária para o Porto e avisos meteorológicos dos distritos do Norte | Horária |
| Open-Meteo | Temperatura e precipitação observadas (45 dias) e previstas no Porto | Horária |
| `data/su-local.xlsx` | Afluência diária ao SU (idades, diagnósticos, internamento, origem, temperatura, ÍCARO) | Manual |

## Alertas ("flags") e padrões

- **Estatística** (`lib/stats.ts`): a média dos últimos 7 dias é comparada com a linha de base das 5 épocas anteriores para a mesma altura do ano (±7 dias). z ≥ 1 dá **Atenção** e z ≥ 2 dá **Alerta**.
- **Dados locais** (`lib/local.ts`): semana de pico, pico respiratório, dias anómalos (média + 2 DP por dia da semana), correlação temperatura ↔ infeções respiratórias com desfasamento, padrão semanal e idosos.
- **IA open-source** (`lib/ai.ts`): Llama 3.3 70B (Groq, gratuito) ou Qwen 2.5 72B (Hugging Face, gratuito) recebe só os números calculados e redige a síntese. A IA **não decide** os níveis de alerta. Sem chave configurada, o texto é gerado por regras.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `GROQ_API_KEY` | não | Chave gratuita em console.groq.com — ativa a síntese por IA |
| `HF_TOKEN` | não | Alternativa: token gratuito do Hugging Face |
| `GROQ_MODEL` / `HF_MODEL` | não | Trocar de modelo |
| `REGIAO_ARS` | não | Por omissão `ARS Norte` |
| `INSTITUICAO_SNS` | não | Por omissão `Unidade Local de Saúde de Santo António, EPE` |

## Atualizar os dados locais

1. Substituir `data/su-local.xlsx` por um Excel com as mesmas colunas (no GitHub: *Add file → Upload files*).
2. A Vercel volta a construir a página; o script `scripts/import-excel.mjs` converte o Excel em JSON automaticamente.

## Desenvolvimento

```bash
npm install
npm run dev
```

O sistema de design (Swiss minimal, Atkinson Hyperlegible, tokens com modo escuro e contraste AA) foi gerado com a skill `ui-ux-pro-max`.
