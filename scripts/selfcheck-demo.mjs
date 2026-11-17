// Verifica os ficheiros de demonstração (public/demo): leitura, cabeçalhos, deteção e coerência interna.
// Uso: node --no-warnings scripts/selfcheck-demo.mjs   (gerar antes com npm run demo)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readXlsxFile from "read-excel-file/node";
import { toTable } from "../lib/analise.ts";
import {
  detectarModelo, tabelaComCensura, agregarMensal, nivelDiarioULSSA, resumoVigilancia, virusResumo, FOLHAS_MENSAIS, CORES,
} from "../lib/modelos.ts";

const DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "public", "demo");
const AVISO = "DADOS FICTÍCIOS gerados automaticamente para demonstração. Não correspondem a doentes nem a atividade real da ULS Santo António.";
const TAMANHO_MAX = 300 * 1024;
const MODELO_DE = Object.fromEntries(FOLHAS_MENSAIS.map((f) => [f.folha, f.folha]));
const ESPERADO = { SU_diario: "su_diario", SU_diagnosticos: "su_diagnosticos", Internamento: "internamento", CSP_mensal: "csp_mensal", CSP_ICPC2: "csp_icpc2", Virus_SPCIRA: "virus_spcira" };

/** Lê um ficheiro e devolve as folhas como o browser (tabelaComCensura + toTable). */
async function lerLivro(nome) {
  const ficheiro = path.join(DIR, nome);
  const tamanho = fs.statSync(ficheiro).size;
  assert.ok(tamanho < TAMANHO_MAX, `${nome} com ${tamanho} bytes`);
  const folhas = await readXlsxFile(ficheiro);
  return folhas.map((f) => ({ sheet: f.sheet, data: f.data, table: tabelaComCensura(f.data, toTable) }));
}

// ---- ULSSA_DEMO_FICTICIO.xlsx ----
const livro = await lerLivro("ULSSA_DEMO_FICTICIO.xlsx");
assert.deepEqual(livro.map((f) => f.sheet), ["Aviso", ...FOLHAS_MENSAIS.map((f) => f.folha)]);
assert.equal(livro[0].data[0][0], AVISO);
assert.equal(detectarModelo(livro[0].table), null);
for (const f of FOLHAS_MENSAIS) {
  const folha = livro.find((x) => x.sheet === f.folha);
  assert.deepEqual(folha.data[0], f.cabecalho, `cabeçalho de ${f.folha}`);
  assert.equal(detectarModelo(folha.table), ESPERADO[MODELO_DE[f.folha]], `modelo de ${f.folha}`);
}
console.log("ULSSA: folhas, cabeçalhos e deteção: ok");

const tabelas = livro.slice(1).map((f) => f.table);
const m = agregarMensal(tabelas);
assert.equal(m.su.nRows, 411);
assert.equal(m.intern.nRows, 411);
assert.equal(m.sud.nRows, 411);
assert.equal(m.csp.nRows, 84);      // 14 meses × 2 ACeS × 3 grupos
assert.equal(m.icpc.nRows, 28);     // 14 meses × 2 ACeS
assert.equal(m.virus.nRows, 59);    // semanas de 29/09/2025 a 09/11/2026
console.log("agregação mensal (411 dias, 84 CSP, 28 ICPC, 59 semanas): ok");

// Coerência: idades e triagem somam o total em cada dia
const col = (t, nome) => t.columns.find((c) => c.name === nome).values;
const total = col(m.su, "Total");
const idades = m.su.columns.filter((c) => /anos$/.test(c.name));
assert.equal(idades.length, 10);
for (let i = 0; i < m.su.nRows; i++) {
  assert.equal(idades.reduce((s, c) => s + c.values[i], 0), total[i], `idades dia ${i}`);
  assert.equal(CORES.reduce((s, c) => s + col(m.su, c)[i], 0), total[i], `triagem dia ${i}`);
}
console.log("idades e triagem somam o total: ok");

// Internamento entre 10 % e 13 % dos episódios; ocupação e UCI dentro dos intervalos
const intern = col(m.su, "Destino internamento");
const enf = col(m.intern, "Ocupação enfermarias (%)");
const uci = col(m.intern, "Admissões UCI");
for (let i = 0; i < m.su.nRows; i++) {
  const pct = intern[i] / total[i];
  assert.ok(pct >= 0.1 && pct <= 0.13, `internamento ${pct} no dia ${i}`);
  assert.ok(enf[i] >= 85 && enf[i] <= 98, `ocupação ${enf[i]}`);
  assert.ok(uci[i] >= 2 && uci[i] <= 8, `UCI ${uci[i]}`);
}
console.log("internamento, ocupação e UCI nos intervalos: ok");

// Modelos calculados sobre o ficheiro
const niveis = nivelDiarioULSSA(m.su, m.intern);
assert.equal(niveis.at(-1).data, "2026-11-15");
const vir = virusResumo(m.virus);
assert.equal(vir.semanas.length, 59);
console.log("níveis diários e vírus calculados: ok");

// ---- Vigilancia_DEMO_FICTICIO.xlsx ----
const vig = await lerLivro("Vigilancia_DEMO_FICTICIO.xlsx");
assert.equal(vig[0].data[0][0], AVISO);
assert.equal(detectarModelo(vig[1].table), "vigilancia");
const r = resumoVigilancia(vig[1].table, []);
assert.ok(r, "resumo da vigilância");
assert.equal(r.refDate, "2026-11-15");
assert.equal(vig[1].table.nRows, 411);
console.log("Vigilância: deteção e resumo: ok");

console.log("selfcheck-demo: ok");
