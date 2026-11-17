// Verificação rápida da lógica por ULS: `node scripts/selfcheck-uls.mjs`
import assert from "node:assert/strict";
import { ulsOf, decumulate, compareHomologous, groupByUls } from "../lib/uls.ts";

assert.equal(ulsOf("Unidade Local de Saúde de Braga, E.P.E. - Hospital de Braga")?.key, "braga");
assert.equal(ulsOf("Unidade Local de Saúde de Barcelos/Esposende, EPE")?.key, "barcelos");
assert.equal(ulsOf("Unidade Local de Saúde de Coimbra, E.P.E. - Hospital X"), undefined);
assert.equal(ulsOf("Trofa Saúde Braga"), undefined);
// Unidade com nome de outra ULS depois do " - " não engana a correspondência
assert.equal(ulsOf("Unidade Local de Saúde do Nordeste, E.P.E. - UCSP Braga")?.key, "nordeste");

const d = decumulate([{ mes: "2025-12", v: 120 }, { mes: "2026-02", v: 25 }, { mes: "2026-01", v: 10 }], ["v"]);
assert.deepEqual(d.map((r) => r.v), [120, 10, 15]);

// Tâmega e Sousa 2025: julho repetiu o acumulado de junho → julho e agosto ficam "a rever"
const tam = decumulate([{ mes: "2025-06", v: 106 }, { mes: "2025-07", v: 106 }, { mes: "2025-08", v: 143 }, { mes: "2025-09", v: 160 }], ["v"]);
assert.ok(Number.isNaN(tam[1].v) && Number.isNaN(tam[2].v)); assert.equal(tam[3].v, 17);
const sus = compareHomologous([{ mes: "2025-08", valor: NaN }, { mes: "2026-08", valor: 17331 }], "pct");
assert.equal(sus.suspeito, true); assert.equal(sus.level, "sem-dados"); assert.equal(sus.valor, 17331);

const c = compareHomologous([{ mes: "2025-10", valor: 100 }, { mes: "2026-09", valor: 90 }, { mes: "2026-10", valor: 125 }], "poisson");
assert.equal(c.z, 2.5); assert.equal(c.level, "atencao"); assert.equal(c.varPct, 25);
assert.equal(compareHomologous([{ mes: "2026-10", valor: 5 }], "pct").level, "sem-dados");
assert.equal(compareHomologous([{ mes: "2025-10", valor: 100 }, { mes: "2026-10", valor: 121 }], "pct").level, "alerta");

const g = groupByUls([
  { instituicao: "Unidade Local de Saúde de Matosinhos, E.P.E. - Hospital Pedro Hispano", mes: "2026-10", valor: 80 },
  { instituicao: "Unidade Local de Saúde de Matosinhos, E.P.E. - UCC X", mes: "2026-10", valor: 2 },
  { instituicao: "Unidade Local de Saúde de Matosinhos, E.P.E. - Hospital Pedro Hispano", mes: "2026-11", valor: 30 },
], "2026-11");
assert.deepEqual(g.get("matosinhos"), [{ mes: "2026-10", valor: 82 }]);
console.log("selfcheck-uls: ok");

const { parseAiFlags } = await import("../lib/ai.ts");
const ind = [{ id: "obitos:braga", label: "x", level: "atencao", detail: "" }, { id: "resp", label: "y", level: "normal", detail: "" }];
const p = parseAiFlags('Aqui vai: {"flags":[{"indicadores":["obitos:braga","inventado"],"titulo":"A"},{"indicadores":["resp"],"titulo":"B"},{"indicadores":["nada"],"titulo":"C"}]}', ind);
assert.deepEqual(p.map((f) => [f.titulo, f.level, f.indicadores.join()]), [["A", "atencao", "obitos:braga"], ["B", "info", "resp"]]);
assert.deepEqual(parseAiFlags("sem json", ind), []);
console.log("selfcheck-ai-flags: ok");
assert.deepEqual(parseAiFlags('```json\n{"flags":[{"indicadores":["[obitos:braga]"],"titulo":"D"}]}\n```', ind).map((f) => f.indicadores[0]), ["obitos:braga"]);
console.log("selfcheck-ai-flags (ids com parênteses): ok");

const { rangeFlag } = await import("../lib/stats.ts");
// 6 épocas de série constante 100 com ruído; pico de 200 em janeiro da última época → Alerta com dias contados
const pts = [];
for (let t = Date.parse("2020-10-01"); t <= Date.parse("2026-03-31"); t += 864e5) {
  const d = new Date(t).toISOString().slice(0, 10);
  pts.push({ date: d, value: (d >= "2026-01-10" && d <= "2026-01-20" ? 200 : 100) + 5 * Math.sin(t / 864e5 * 1.3) + 3 * Math.sin(t / 864e5 * 0.21) });
}
const rf = rangeFlag("x", "X", "", pts, "2026-01-01", "2026-01-31");
assert.equal(rf.level, "alerta"); assert.equal(rf.years, 5);
for (const [a, b] of [["2025-11-01", "2025-11-30"], ["2025-10-01", "2025-12-31"], ["2025-12-01", "2025-12-07"]]) {
  assert.notEqual(rangeFlag("x", "X", "", pts, a, b).level, "alerta", `${a}..${b}`);
}
assert.equal(rangeFlag("x", "X", "", pts, "2030-01-01", "2030-01-31").level, "sem-dados");
assert.equal(rangeFlag("x", "X", "", pts, "2021-01-01", "2021-01-31").level, "sem-dados"); // sem 3 anos anteriores
console.log("selfcheck-range: ok");

const { dgsLevel, regionalDgsLevel, dgsIndicators } = await import("../lib/risk.ts");
assert.deepEqual([-8, 9.9, 10, 25, 49, 50].map((v) => dgsLevel(v, [10, 25, 50])), [0, 0, 1, 2, 2, 3]);
assert.equal(dgsLevel(100, [100, 100, Infinity]), 2); // Medicina ≥ 100 % → nível 2
const dind = dgsIndicators([{ id: "episodios", current: 127, baselineMean: 100 }]);
const rl = regionalDgsLevel(dind);
assert.equal(rl.level, 2); assert.equal(rl.withData, 1); assert.match(rl.reason, /\+27,0 % → nível 2/);
assert.equal(regionalDgsLevel(dgsIndicators([])).level, null);
console.log("selfcheck-risk: ok");

const { parseEvm } = await import("../lib/evm.ts");
const t = (md) => Date.parse(`2012-${md}T00:00:00Z`);
const html = `x new Highcharts.Chart({ "title": { "text": "Mortalidade na região de saúde ARS Centro" }, "series": [ { "data": [ [ ${t("01-01")}, 1 ] ], "name": "2026" } ] })
 new Highcharts.Chart({ "title": { "text": "Mortalidade na região de saúde ARS Norte" }, "series": [ { "data": [ [ ${t("02-28")}, 100 ], [ ${t("02-29")}, 101 ], [ ${t("11-16")}, 104 ] ], "name": "2025" }, { "data": [ [ ${t("11-15")}, 110 ], [ ${t("11-16")}, null ] ], "name": "2026" } ] })`;
const ev = parseEvm(html, "ARS Norte");
assert.deepEqual(ev, [{ date: "2025-02-28", value: 100 }, { date: "2025-11-16", value: 104 }, { date: "2026-11-15", value: 110 }]);
assert.deepEqual(parseEvm("<html>mudou</html>", "ARS Norte"), []);
console.log("selfcheck-evm: ok");

const { parseCSV, toTable, aggregateByDate, correlate, summarize, asNum } = await import("../lib/analise.ts");
const addD = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

// CSV com ; (cabeçalho), aspas, "" escapadas, quebras de linha dentro de campos e BOM
assert.deepEqual(parseCSV('﻿Nome;Obs;Valor\n"Ana; A";"texto ""x""";"1.234,5"\n"B";"linha\nnova";2\n'), [
  ["Nome", "Obs", "Valor"], ["Ana; A", 'texto "x"', "1.234,5"], ["B", "linha\nnova", "2"],
]);
assert.equal(parseCSV("a,b,c\n1,2,3")[1][2], "3");
assert.equal(parseCSV("a\tb\n1\t2")[1][0], "1");

// Números PT e dd/mm/aaaa
assert.equal(asNum("1.234,5"), 1234.5); assert.equal(asNum("1234,5"), 1234.5); assert.equal(asNum("1234.5"), 1234.5); assert.equal(asNum("abc"), null);
const tb = toTable(parseCSV("Data;Total;Obs\n01/10/2025;\"1.234,5\";x\n02/10/2025;12;y\n03/10/2025;3,5;z\n04/10/2025;7;w\n05/10/2025;8;v"));
assert.deepEqual(tb.columns.map((c) => c.type), ["date", "number", "category"]);
assert.equal(tb.nRows, 5);
assert.equal(tb.columns[0].values[0].toISOString().slice(0, 10), "2025-10-01");
assert.equal(tb.columns[1].values[0], 1234.5);
// Excel: número de série só em coluna "data"
const serial = Date.UTC(2025, 9, 1) / 864e5 + 25569;
const tsx = toTable([["Data", "Valor"], [serial, 1], [serial + 1, 2], [serial + 2, 3], [serial + 3, 4], [serial + 4, 5]]);
assert.equal(tsx.columns[0].type, "date"); assert.equal(tsx.columns[0].values[0].toISOString().slice(0, 10), "2025-10-01");
assert.equal(toTable([["Valor"], [serial], [serial + 1], [serial + 2], [serial + 3], [serial + 4]]).columns[0].type, "number");

// Agregação semanal com início à segunda-feira (2025-10-05 é domingo, 2025-10-06 segunda)
assert.deepEqual(aggregateByDate(["2025-10-05", "2025-10-06"], [1, 2], "semana", "soma"), [
  { date: "2025-09-29", value: 1 }, { date: "2025-10-06", value: 2 },
]);
assert.deepEqual(aggregateByDate(["2025-10-01", "2025-10-03", "2025-10-03"], [1, 2, 3], "dia", "media"), [
  { date: "2025-10-01", value: 1 }, { date: "2025-10-03", value: 2.5 },
]);
assert.deepEqual(aggregateByDate(["2025-10-01", "2025-11-03"], [5, 1], "mes", "contagem"), [
  { date: "2025-10-01", value: 1 }, { date: "2025-11-01", value: 1 },
]);

// Correlação: série e cópia deslocada 3 dias para a frente → melhor lag 3, r ≈ 1
const base = [];
for (let i = 0; i < 40; i++) base.push({ date: addD("2025-10-01", i), value: Math.sin(i * 0.7) * 10 + (i % 5) * 3 + i * 0.2 });
const shifted = base.map((p) => ({ date: addD(p.date, 3), value: p.value }));
const cr = correlate(base, shifted, 14);
assert.equal(cr.bestLag.lag, 3); assert.ok(Math.abs(cr.bestLag.r - 1) < 1e-9);
assert.ok(Math.abs(correlate(base, base).pearson - 1) < 1e-9);
assert.ok(Math.abs(correlate(base, base).spearman - 1) < 1e-9);
assert.equal(cr.lags.length, 29);
assert.ok(Number.isNaN(correlate(base.slice(0, 5), base.slice(0, 5)).pearson)); // n < 8

// Resumo para a IA: sem valores de categoria, séries semanais ≤ 60 pontos
const big = [["Data", "Doente", "Idade"]];
for (let i = 0; i < 400; i++) big.push([addD("2024-01-01", i), "Nome Secreto " + i, 20 + (i % 60)]);
const sum = summarize(toTable(big));
assert.equal(sum.registos, 400);
assert.ok(!JSON.stringify(sum).includes("Nome Secreto"));
assert.ok(sum.semanal.every((s) => s.pontos.length <= 60));
assert.equal(sum.colunas[1].distintos, 400);
console.log("selfcheck-analise: ok");

{
  const { toTable: tt } = await import("../lib/analise.ts");
  const t = tt([["Ano", "Dia", "Mês2", "Tmax"], [2026, 1, "Janeiro", 12], [2026, 2, "Setembto", 20], [2026, 31, "Junho", 25], [0.59, 3, "Março", 9]]);
  const d = t.columns[0];
  assert.equal(d.name, "Data"); assert.equal(d.type, "date");
  assert.deepEqual(d.values.map((v) => (v ? v.toISOString().slice(0, 10) : null)), ["2026-01-01", "2026-09-02", null, null]);
  console.log("selfcheck-data-repartida: ok");
}
{
  const { toTable: tt } = await import("../lib/analise.ts");
  const t = tt([["Ano", "Dia", "Mês", "Alerta Frieza"], [2023, 1, "Janeiro", new Date(Date.UTC(2023, 0, 11))], [2023, 2, "Janeiro", null], [2023, 3, "Janeiro", null]]);
  assert.equal(t.columns[0].name, "Data");
  console.log("selfcheck-data-esparsa: ok");
}
