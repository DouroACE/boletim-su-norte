// Verificação de juntarTabelas/tabelaDePontos (Workspace): `node scripts/selfcheck-juntar-tabelas.mjs`
import assert from "node:assert/strict";
import { juntarTabelas, tabelaDePontos, aggregateByDate } from "../lib/analise.ts";

const d = (s) => new Date(`${s}T00:00:00Z`);
const semanal = { nRows: 2, columns: [
  { name: "Data", type: "date", values: [d("2026-01-05"), d("2026-01-12")] },
  { name: "Nível", type: "number", values: [1, 2] },
  { name: "Texto", type: "category", values: ["a", "b"] },
] };
const diario = tabelaDePontos("ÍCARO", [{ date: "2026-01-05", value: 0.5 }, { date: "2026-01-06", value: 1.5 }, { date: "2026-01-12", value: 3 }]);
const vazia = { nRows: 0, columns: [{ name: "Data", type: "date", values: [] }, { name: "X", type: "number", values: [] }] };
const semData = { nRows: 1, columns: [{ name: "Y", type: "number", values: [9] }] };

const t = juntarTabelas([{ prefixo: "Registo", table: semanal }, { prefixo: "", table: diario }, { prefixo: "P", table: vazia }, { prefixo: "Q", table: semData }]);
assert.equal(t.nRows, 5);
assert.deepEqual(t.columns.map((c) => c.name), ["Data", "Registo · Nível", "ÍCARO"]);
assert.deepEqual(t.columns[1].values, [1, 2, null, null, null]);
assert.deepEqual(t.columns[2].values, [null, null, 0.5, 1.5, 3]);

// A média semanal de cada variável só usa as linhas da sua origem.
const media = (ci) => aggregateByDate(t.columns[0].values, t.columns[ci].values, "semana", "media").map((p) => p.value);
assert.deepEqual(media(1), [1, 2]);
assert.deepEqual(media(2), [1, 3]);

assert.deepEqual(juntarTabelas([]), { nRows: 0, columns: [{ name: "Data", type: "date", values: [] }] });
// Coluna numérica só com vazios fica de fora.
const soVazios = { nRows: 1, columns: [{ name: "Data", type: "date", values: [d("2026-01-05")] }, { name: "Z", type: "number", values: [null] }, { name: "W", type: "number", values: [2] }] };
assert.deepEqual(juntarTabelas([{ prefixo: "", table: soVazios }]).columns.map((c) => c.name), ["Data", "W"]);
console.log("selfcheck-juntar-tabelas: ok");
