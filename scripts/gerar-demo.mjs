// Gera dados FICTÍCIOS para demonstração em public/demo/ (semente fixa: as mesmas execuções dão os mesmos ficheiros).
// Uso: npm run demo   (node scripts/gerar-demo.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import writeExcelFile from "write-excel-file/node";
import { FOLHAS_MENSAIS, CORES } from "../lib/modelos.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "public", "demo");
const AVISO = "DADOS FICTÍCIOS gerados automaticamente para demonstração. Não correspondem a doentes nem a atividade real da ULS Santo António.";
const INICIO = "2025-10-01", FIM = "2026-11-15";
const DAY = 864e5;

/* ---------- Aleatoriedade determinística ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20251001);
const gauss = () => {
  let u = 0;
  while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
};
/** Poisson (Knuth; aproximação normal para médias grandes). */
function poisson(lam) {
  if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss()));
  const L = Math.exp(-lam);
  let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/* ---------- Calendário e padrões ---------- */
const toT = (s) => Date.parse(s + "T00:00:00Z");
const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const diasEntre = (a, b) => { const out = []; for (let t = toT(a); t <= toT(b); t += DAY) out.push(isoOf(t)); return out; };
const DIAS = diasEntre(INICIO, FIM);
const anoDe = (s) => s.slice(0, 4);
/** Dias desde 1 de janeiro (0 = 1 jan). */
const doyDe = (s) => (toT(s) - toT(`${anoDe(s)}-01-01`)) / DAY;
/** Inverno: 1 em meados de janeiro, 0 em julho. */
const inverno = (s) => 0.5 * (1 + Math.cos((2 * Math.PI * (doyDe(s) - 14)) / 365.25));
/** Plateau com bordas suaves, centrado em 1 jan 2026 (x dias de distância). */
const plateau = (x, meia, sd) => Math.exp(-(Math.max(0, Math.abs(x) - meia) ** 2) / (2 * sd * sd));
const distJan1 = (s) => (toT(s) - toT("2026-01-01")) / DAY;
/** Pico de gripe: late dez → meados jan. */
const gripe = (s) => plateau(distJan1(s), 10, 6);
/** Vaga de frio: 23 dez → 10 jan. */
const frio = (s) => plateau(distJan1(s), 9, 5);
/** Vaga de calor 10–14 jun 2026 (meios-dias nos dias de transição). */
const calor = (s) => (s >= "2026-06-10" && s <= "2026-06-14" ? 1 : s === "2026-06-09" || s === "2026-06-15" ? 0.5 : 0);
const DIA_SEMANA = [0.91, 1.08, 1.03, 1.02, 1.0, 1.0, 0.94]; // domingo → sábado

/* Temperatura (Porto): forma sazonal + ruído + vagas de frio e calor */
const tempDia = DIAS.map((s) => {
  const c = 2 * Math.PI * (doyDe(s) - 14) / 365.25;
  const tmax = 20.2 - 7.2 * Math.cos(c) + 1.6 * gauss() - 4.5 * frio(s) + 8.5 * calor(s);
  const tmin = 11.8 - 4.8 * Math.cos(c) + 1.2 * gauss() - 5.0 * frio(s) + 4 * calor(s);
  return { data: s, tmax: Math.round(tmax * 10) / 10, tmin: Math.round(Math.min(tmin, tmax - 2) * 10) / 10 };
});

/* Procura do SU: índice bruto, depois escalado para média ≈ 340 episódios/dia */
const brutos = DIAS.map((s) => {
  const f = inverno(s);
  return DIA_SEMANA[new Date(toT(s)).getUTCDay()] * (1 + 0.13 * f) * (1 + 0.2 * gripe(s)) * (1 + 0.15 * calor(s)) * (1 + 0.04 * gauss());
});
const escala = 340 / (brutos.reduce((a, b) => a + b, 0) / brutos.length);
const episodios = brutos.map((b) => Math.round(b * escala));

/* ---------- Dados diários ---------- */
const IDADES = ["0-9 anos", "10-19 anos", "20-29 anos", "30-39 anos", "40-49 anos", "50-59 anos", "60-69 anos", "70-79 anos", "80-89 anos", "90+ anos"];
const IDADE_PESO = [0.04, 0.03, 0.05, 0.08, 0.11, 0.13, 0.14, 0.16, 0.16, 0.10];
const TRIAGEM_PESO = { Vermelho: 0.01, Laranja: 0.12, Amarelo: 0.45, Verde: 0.35, Azul: 0.06, Branco: 0.01 }; // Branco: resto do dia

const SU = DIAS.map((s, i) => {
  const total = episodios[i];
  const f = inverno(s), g = gripe(s), h = calor(s), fr = frio(s);
  // Idades: peso ligeiramente maior nas crianças em época de gripe; soma exata = total
  const pesos = IDADE_PESO.map((p, k) => p * Math.exp(0.03 * gauss()) * (k <= 1 ? 1 + 0.25 * g : 1));
  const soma = pesos.reduce((a, b) => a + b, 0);
  const idade = pesos.slice(0, -1).map((p) => Math.round((total * p) / soma));
  idade.push(total - idade.reduce((a, b) => a + b, 0));
  // Triagem: cores com ruído; Branco = resto (soma exata)
  const pTri = Object.entries(TRIAGEM_PESO).map(([c, p]) => [c, p * Math.exp(0.05 * gauss())]);
  const sTri = pTri.reduce((a, [, p]) => a + p, 0);
  const cores = {};
  for (const [c, p] of pTri) cores[c] = Math.round((total * p) / sTri);
  cores.Branco = total - Object.entries(cores).filter(([c]) => c !== "Branco").reduce((a, [, v]) => a + v, 0);
  const internamento = Math.round(total * clamp(0.115 + 0.006 * gauss() + 0.01 * g, 0.105, 0.125));
  return {
    Data: s,
    Total: total,
    idade,
    cores,
    internamento,
    uci: poisson(1.2 + 0.4 * f),
    obitosSU: poisson(0.8 + 0.6 * f + 1.0 * g),
    triagem: Math.round((70 + 25 * g + 10 * f + 6 * gauss()) * 10) / 10,
    psiquiatria: poisson(4 + 1 * h),
    f, g, h, fr,
  };
});

const SU_DIAG = SU.map((r) => {
  const { f, g, h, fr } = r;
  const lam = {
    "A09": 3 + 2 * (1 - f) + 1 * h,
    "E86.0": 1 + 0.5 * (1 - f) + 3 * h,
    "I20.0": 0.6 + 0.6 * fr,
    "I21": 0.5 + 0.3 * fr,
    "I24.9": 0.9 + 0.4 * fr,
    "J00-J06": 8 + 4 * f + 1 * g,
    "J09-J11": 0.5 + 9 * g + 0.8 * f,
    "J20-J22": 4 + 4 * f + 4 * g,
    "J44": 3 + 2 * f + 1 * g,
    "J45": 2 + 1 * f + 0.5 * g,
    "R11": 3 + 2 * h,
    "R19.7": 2 + 1.5 * (1 - f) + 0.5 * h,
    "T58": 0.2 + 0.4 * f,
    "T68": 0.15 + 1.2 * fr + 0.2 * f,
  };
  const out = { Data: r.Data };
  for (const [k, v] of Object.entries(lam)) out[k] = poisson(v);
  return out;
});

const INTERNA = SU.map((r) => {
  const { f, g } = r;
  return {
    Data: r.Data,
    enfermarias: Math.round(clamp(86 + 8 * f + 3 * g + 0.8 * gauss(), 85, 98) * 10) / 10,
    medicina: Math.round(clamp(90 + 9 * f + 9 * g + 1.2 * gauss(), 90, 108) * 10) / 10,
    uci: clamp(poisson(3.5 + 2 * f + 1.5 * g), 2, 8),
    boarding: poisson(8 + 6 * f + 16 * g),
    obitos: clamp(poisson(3 + 0.8 * f), 1, 6),
  };
});

const VIGILANCIA = tempDia.map((t, i) => {
  const { f, fr } = SU[i];
  const h = SU[i].h;
  // Mortalidade diária ACeS Gondomar: base sazonal + 5–6 extra em frio e calor
  return { Data: t.data, Tmax: t.tmax, Tmin: t.tmin, Obitos: poisson(11 + 3.5 * f + 5.5 * fr + 5.5 * h) };
});

/* ---------- Mensal (ACeS) ---------- */
const MESES = [];
for (let y = 2025, m = 10; MESES.length < 14; ) { MESES.push(`${y}-${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; y++; } }
/** Média mensal de um indicador diário (função de cada dia). */
const mediaMes = (mes, fn) => { const ds = DIAS.map((s, i) => [s, i]).filter(([s]) => s.startsWith(mes)); return ds.reduce((a, [s, i]) => a + fn(s, i), 0) / ds.length; };
const FATOR_MES = { 1: 1.0, 2: 0.98, 3: 1.02, 4: 1.0, 5: 1.0, 6: 0.98, 7: 0.9, 8: 0.85, 9: 0.98, 10: 1.03, 11: 1.02, 12: 0.99 };
const ACES = [
  { nome: "ACeS Gondomar", base: 41000, ira: 900, sns: 1 },
  { nome: "ACeS Porto Ocidental", base: 36000, ira: 820, sns: 0.9 },
];
const GRUPOS = [["0-14", 0.12], ["15-64", 0.56], ["65+", 0.32]];
const CSP_MENSAL = [];
const ICPC = [];
for (const mes of MESES) {
  const fM = mediaMes(mes, (s) => inverno(s));
  const gM = mediaMes(mes, (s) => gripe(s));
  const hM = mediaMes(mes, (s) => calor(s));
  const mm = Number(mes.slice(5));
  const cresc = mes >= "2026-01" ? 1.02 : 1;
  for (const a of ACES) {
    for (const [grupo, peso] of GRUPOS) {
      const abertas = Math.round(a.base * peso * FATOR_MES[mm] * cresc * (1 + 0.1 * fM + 0.1 * gM) * (1 + 0.03 * gauss()));
      CSP_MENSAL.push({
        "Mês": mes, ACeS: a.nome, "Grupo etário": grupo,
        "Consultas abertas": abertas,
        "Consultas programadas": Math.round(abertas * (0.78 + 0.02 * gauss())),
        "Referenciações SNS 24": Math.round(abertas * (0.03 + 0.03 * gM) * a.sns * (1 + 0.05 * gauss())),
        "Consultas SAC": Math.round(abertas * (0.1 + 0.03 * fM) * (1 + 0.05 * gauss())),
      });
    }
    const ruido = () => 1 + 0.04 * gauss();
    const cel = (v) => (v < 5 ? "<5" : v);
    ICPC.push({
      "Mês": mes, ACeS: a.nome,
      IRA: Math.round(a.ira * (1 + 1.8 * gM + 0.8 * fM) * ruido()),
      A04: Math.round(330 * (1 + 0.4 * fM) * ruido()),
      A08: Math.round(200 * ruido()),
      A88: cel(Math.round(1 + 120 * hM + 4 * (1 - fM))),
      "D70-D73": Math.round(110 * (1 + 0.5 * (1 - fM)) * ruido()),
      K07: Math.round(60 * ruido()),
      K77: Math.round(140 * (1 + 0.5 * fM + 0.3 * gM) * ruido()),
      S92: cel(Math.round(2 + 30 * hM + 6 * (1 - fM))),
      T11: Math.round((40 * (1 + 0.5 * (1 - fM)) + 60 * hM) * ruido()),
    });
  }
}

/* ---------- SPCIRA (semanal) ---------- */
const SEMANAS = [];
for (let t = toT("2025-09-29"); t <= toT("2026-11-09"); t += 7 * DAY) SEMANAS.push(isoOf(t));
/** Interpolação linear entre pontos (data → %). */
const curva = (pontos, s) => {
  for (let i = 1; i < pontos.length; i++) {
    const [a, va] = pontos[i - 1], [b, vb] = pontos[i];
    if (s <= b) return va + ((vb - va) * (toT(s) - toT(a))) / (toT(b) - toT(a));
  }
  return pontos.at(-1)[1];
};
const VIRUS_CURVAS = {
  influenza: [["2025-09-29", 2], ["2025-11-03", 4], ["2025-12-01", 12], ["2025-12-22", 26], ["2026-01-05", 40], ["2026-01-26", 26], ["2026-02-16", 8], ["2026-03-16", 3], ["2026-05-04", 1.5], ["2026-09-21", 1.5], ["2026-10-19", 2], ["2026-11-09", 3]],
  vsr: [["2025-09-29", 3], ["2025-11-03", 6], ["2025-11-17", 18], ["2025-11-24", 25], ["2025-12-15", 25], ["2025-12-29", 17], ["2026-01-19", 7], ["2026-02-09", 3], ["2026-04-06", 1.5], ["2026-09-21", 1.5], ["2026-10-19", 2], ["2026-11-09", 4]],
  covid: [["2025-09-29", 4], ["2025-10-20", 6], ["2025-11-10", 10], ["2025-12-08", 7], ["2026-01-12", 4], ["2026-02-16", 3], ["2026-05-04", 3], ["2026-06-15", 4], ["2026-09-21", 3], ["2026-10-26", 5], ["2026-11-09", 7]],
};
const VIRUS_TESTES = { influenza: 1, vsr: 0.9, covid: 0.8 };
const VIRUS = SEMANAS.map((s) => {
  const base = 120 + 230 * inverno(s);
  const linha = { Semana: s };
  for (const [v, rot] of [["influenza", "Influenza A"], ["vsr", "VSR"], ["covid", "SARS-CoV-2"]]) {
    const testes = clamp(Math.round((base * VIRUS_TESTES[v]) + 40 * gauss()), 50, 450);
    const p = Math.max(0.5, curva(VIRUS_CURVAS[v], s) * (1 + 0.08 * gauss()));
    const pos = clamp(Math.round((testes * p) / 100), 0, testes);
    linha[`${rot} positivos`] = pos;
    linha[`${rot} negativos`] = testes - pos;
  }
  return linha;
});

/* ---------- Escrita dos ficheiros ---------- */
const texto = (value, bold = false) => ({ value, type: String, ...(bold ? { fontWeight: "bold" } : {}) });
const celula = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return texto(v);
  return { value: v };
};
const dataCel = (s) => ({ value: new Date(toT(s)), type: Date, format: "yyyy-mm-dd" });
const cabecalho = (nomes) => nomes.map((h) => texto(h, true));

/** Linhas de cada folha, na ordem e com os cabeçalhos exatos de FOLHAS_MENSAIS. */
const folhas = {
  SU_diario: SU.map((r) => [
    dataCel(r.Data), r.Total, ...r.idade, ...CORES.map((c) => r.cores[c]), r.internamento, r.uci, r.obitosSU, r.triagem, r.psiquiatria,
  ]),
  SU_diagnosticos: SU_DIAG.map((r) => FOLHAS_MENSAIS.find((f) => f.folha === "SU_diagnosticos").cabecalho.map((c) => (c === "Data" ? dataCel(r.Data) : r[c]))),
  Internamento: INTERNA.map((r) => [dataCel(r.Data), r.enfermarias, r.medicina, r.uci, r.boarding, r.obitos]),
  CSP_mensal: CSP_MENSAL.map((r) => FOLHAS_MENSAIS.find((f) => f.folha === "CSP_mensal").cabecalho.map((c) => celula(r[c]))),
  CSP_ICPC2: ICPC.map((r) => FOLHAS_MENSAIS.find((f) => f.folha === "CSP_ICPC2").cabecalho.map((c) => celula(r[c]))),
  Virus_SPCIRA: VIRUS.map((r) => FOLHAS_MENSAIS.find((f) => f.folha === "Virus_SPCIRA").cabecalho.map((c) => (c === "Semana" ? dataCel(r.Semana) : r[c]))),
};
// Verificação: cada folha tem exatamente o número de colunas do modelo
for (const f of FOLHAS_MENSAIS) {
  const linhas = folhas[f.folha];
  if (!linhas) throw new Error(`Sem dados gerados para a folha ${f.folha}`);
  for (const l of linhas) if (l.length !== f.cabecalho.length) throw new Error(`${f.folha}: ${l.length} colunas, esperadas ${f.cabecalho.length}`);
}
const ABA = { sheet: "Aviso", data: [[texto(AVISO)]], columns: [{ width: 120 }], stickyRowsCount: 0 };
const folhaXlsx = (nome, rows) => {
  const f = FOLHAS_MENSAIS.find((x) => x.folha === nome);
  return {
    sheet: nome,
    data: [cabecalho(f.cabecalho), ...rows],
    columns: f.cabecalho.map((h) => ({ width: Math.max(12, Math.min(40, h.length + 4)) })),
    stickyRowsCount: 1,
  };
};
const livroULSSA = [ABA, ...FOLHAS_MENSAIS.map((f) => f.folha).map((nome) => folhaXlsx(nome, folhas[nome]))];

const cabVig = ["Data", "Tmax", "Tmin", "MortDiaria no ACES"];
const livroVig = [
  ABA,
  {
    sheet: "Vigilancia",
    data: [cabecalho(cabVig), ...VIGILANCIA.map((r) => [dataCel(r.Data), r.Tmax, r.Tmin, r.Obitos])],
    columns: cabVig.map((h) => ({ width: Math.max(12, h.length + 4) })),
    stickyRowsCount: 1,
  },
];

fs.mkdirSync(OUT, { recursive: true });
const ficheiros = [
  ["ULSSA_DEMO_FICTICIO.xlsx", livroULSSA],
  ["Vigilancia_DEMO_FICTICIO.xlsx", livroVig],
];
for (const [nome, sheets] of ficheiros) {
  const buffer = await writeExcelFile(sheets).toBuffer();
  fs.writeFileSync(path.join(OUT, nome), buffer);
  console.log(`[gerar-demo] ${nome}: ${(buffer.length / 1024).toFixed(0)} KB, ${sheets.length} folhas`);
}
const media = episodios.reduce((a, b) => a + b, 0) / episodios.length;
console.log(`[gerar-demo] ${DIAS.length} dias (${INICIO} → ${FIM}); episódios média ${media.toFixed(1)}, mín ${Math.min(...episodios)}, máx ${Math.max(...episodios)}`);
