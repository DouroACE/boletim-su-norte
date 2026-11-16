// Converte data/su-local.xlsx (folha de afluência ao SU) em data/su-local.json.
// Corre automaticamente antes do build (npm run prebuild). Para atualizar os dados locais
// basta substituir o ficheiro Excel no repositório: a Vercel volta a construir a página.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const src = path.join(root, "data", "su-local.xlsx");
const out = path.join(root, "data", "su-local.json");

// Cabeçalho do Excel -> chave interna. A correspondência é feita por "começa por",
// sem acentos e sem maiúsculas, para tolerar pequenas variações de escrita.
const MAP = [
  ["data", "date"],
  ["total", "total"],
  ["0 a 9", "a0_9"],
  ["10 a 19", "a10_19"],
  ["20 a 29", "a20_29"],
  ["30 a 39", "a30_39"],
  ["40 a 49", "a40_49"],
  ["50 a 59", "a50_59"],
  ["60 a 69", "a60_69"],
  ["70 a 79", "a70_79"],
  ["80 a 89", "a80_89"],
  ["90 a 99", "a90_99"],
  ["100 ou", "a100"],
  ["desconhecido", "aUnk"],
  ["gastroenterite", "gastro"],
  ["angina", "angina"],
  ["infecoes agudas do trato respiratorio superior", "iras"],
  ["infecoes agudas do trato respiratorio inferior", "irai"],
  ["diarreia", "diarreia"],
  ["desidratacao", "desidratacao"],
  ["tempo medio triagem", "tempoTriagem"],
  ["falecidos", "falecidos"],
  ["destino internamento", "internamento"],
  ["enfermaria", "enfermaria"],
  ["uci", "uci"],
  ["idade media", "idadeMedia"],
  ["gondomar", "oGondomar"],
  ["porto ocidental", "oPortoOcidental"],
  ["porto oriental", "oPortoOriental"],
  ["outra", "oOutra"],
  ["desconhecida", "oDesconhecida"],
  ["temp_media", "tMed"],
  ["temp_minima", "tMin"],
  ["temp_maxima", "tMax"],
  ["precipitacao", "precip"],
  ["icaro", "icaro"],
];

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function serialToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return d.toISOString().slice(0, 10);
  }
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const p = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (p) return `${p[3]}-${p[2].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
  return null;
}

if (!fs.existsSync(src)) {
  console.warn(`[import-excel] ${src} não existe; a manter o JSON atual.`);
  process.exit(0);
}

const wb = XLSX.readFile(src);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
const header = rows[0].map(norm);
const keys = header.map((h) => {
  const hit = MAP.find(([prefix]) => h.startsWith(prefix));
  return hit ? hit[1] : null;
});

const unknown = header.filter((h, i) => h && !keys[i]);
if (unknown.length) console.warn("[import-excel] colunas ignoradas:", unknown);

const records = [];
for (const r of rows.slice(1)) {
  if (!r || r[0] == null) continue;
  const rec = {};
  keys.forEach((k, i) => {
    if (!k) return;
    if (k === "date") rec.date = serialToISO(r[i]);
    else rec[k] = r[i] == null || r[i] === "" ? null : Number(r[i]);
  });
  if (rec.date) records.push(rec);
}
records.sort((a, b) => a.date.localeCompare(b.date));

// Formato compacto (colunas + linhas) para manter o ficheiro pequeno
const cols = [...new Set(records.flatMap((r) => Object.keys(r)))];
const round = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
fs.writeFileSync(
  out,
  JSON.stringify({ source: path.basename(src), cols, rows: records.map((r) => cols.map((c) => round(r[c] ?? null))) })
);
console.log(`[import-excel] ${records.length} dias (${records[0]?.date} → ${records.at(-1)?.date}) → ${out}`);
