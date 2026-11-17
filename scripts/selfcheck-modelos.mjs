// Verificação dos modelos automáticos com dados sintéticos: `node --no-warnings scripts/selfcheck-modelos.mjs`
import assert from "node:assert/strict";
import { toTable } from "../lib/analise.ts";
import { detectarModelo, nivelProcuraSU, faixaNiveis, resumoVigilancia, qualidade, predefinicoes } from "../lib/modelos.ts";

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const dias = (a, b) => { const out = []; for (let t = Date.parse(a); t <= Date.parse(b); t += DAY) out.push(iso(t)); return out; };
/** Série diária sintética: valor(data) para cada dia de a a b. */
const serie = (a, b, valor) => { const ds = dias(a, b); return { dates: ds, values: ds.map(valor) }; };

// Deteção por assinatura de colunas
const vig = toTable([["Data", "Tmax", "Tmin", "MortDiaria no ACES"], ["2026-01-01", 12, 4, 3]]);
const afl = toTable([["Data", "Total", "0 a 9 anos", "10 a 19 anos", "80 a 89 anos"], ["2026-01-01", 300, 1, 2, 3]]);
const outra = toTable([["Data", "Vendas"], ["2026-01-01", 5]]);
assert.equal(detectarModelo(vig), "vigilancia");
assert.equal(detectarModelo(afl), "afluencia_su");
assert.equal(detectarModelo(outra), null);
console.log("deteção: ok");

// Procura do SU: ano anterior disponível
{
  const s = serie("2025-01-01", "2026-03-31", (d) => (d >= "2026-03-25" ? 150 : 100));
  const r = nivelProcuraSU(s.dates, s.values, "2026-03-31");
  assert.equal(r.base, "ano anterior");
  assert.equal(r.atual, 150);
  assert.equal(r.referencia, 100);
  assert.equal(r.variacaoPct, 50);
  assert.equal(r.nivel, 3);
}
// Sem ano anterior: referência = 28 dias anteriores à janela
{
  const s = serie("2026-02-01", "2026-03-31", (d) => (d >= "2026-03-25" ? 120 : 100));
  const r = nivelProcuraSU(s.dates, s.values, "2026-03-31");
  assert.equal(r.base, "28 dias anteriores");
  assert.equal(r.referencia, 100);
  assert.equal(r.nivel, 1);
}
// Limiares 10 / 25 / 50 %: 9,9 % → 0; 10 % → 1; 25 % → 2; 50 % → 3
for (const [atual, nivel] of [[109.9, 0], [110, 1], [125, 2], [150, 3]]) {
  const s = serie("2026-02-01", "2026-03-31", (d) => (d >= "2026-03-25" ? atual : 100));
  assert.equal(nivelProcuraSU(s.dates, s.values, "2026-03-31").nivel, nivel, `atual ${atual}`);
}
// Sem dados suficientes → nível nulo
assert.equal(nivelProcuraSU([], [], "2026-03-31").nivel, null);
assert.equal(nivelProcuraSU(["2026-03-31"], [10], "2026-03-31").nivel, null);
console.log("procura do SU: ok");

// Faixa de 30 dias: termina na última data com dados
{
  const s = serie("2026-02-01", "2026-03-31", () => 100);
  const f = faixaNiveis(s.dates, s.values, 30);
  assert.equal(f.length, 30);
  assert.equal(f.at(-1).data, "2026-03-31");
  assert.equal(f[0].data, "2026-03-02");
  assert.equal(faixaNiveis([], [], 30).length, 0);
}
console.log("faixa de 30 dias: ok");

// Vigilância: extremos nos últimos 30 dias, óbitos face ao ano anterior (ficheiro histórico)
{
  const tab = (ds, f) => toTable([["Data", "Tmax", "Tmin", "MortDiaria no ACES"], ...ds.map((d) => [d, f(d).tmax, f(d).tmin, f(d).obit])]);
  const hist = tab(dias("2025-01-01", "2025-06-30"), () => ({ tmax: 20, tmin: 10, obit: 4 }));
  const cur = tab(dias("2026-03-01", "2026-03-31"), (d) => ({
    tmax: d === "2026-03-20" ? 31 : 18,
    tmin: d === "2026-03-10" ? 2 : 9,
    obit: 6,
  }));
  const r = resumoVigilancia(cur, [hist]);
  assert.equal(r.refDate, "2026-03-31");
  assert.equal(r.semana.inicio, "2026-03-25");
  assert.equal(r.semana.diasObitos, 7);
  assert.equal(r.semana.anterior.dias, 7);
  assert.equal(r.semana.variacaoPct, 50); // 6 contra 4 óbitos/dia
  assert.deepEqual(r.extremos.map((e) => [e.data, e.calor, e.frio]), [["2026-03-10", false, true], ["2026-03-20", true, false]]);
  assert.equal(resumoVigilancia(cur, []).semana.anterior, null);
  assert.equal(resumoVigilancia(tab([], () => ({})), []), null);
}
console.log("vigilância: ok");

// Qualidade: linhas sem data, datas repetidas, temperaturas fora de −10…50
{
  const t = toTable([
    ["Data", "Tmin", "Tmax"],
    ["2026-01-01", 5, 15],
    ["2026-01-01", 6, 16],
    ["2026-01-02", -12, 60],
    [null, 4, 14],
  ]);
  const q = qualidade(t);
  assert.equal(q.semDataValida, 1);
  assert.deepEqual(q.datasRepetidas, ["2026-01-01"]);
  assert.equal(q.temperaturas, true);
  assert.deepEqual(q.foraDeIntervalo, [{ data: "2026-01-02", coluna: "Tmax" }, { data: "2026-01-02", coluna: "Tmin" }]);
}
console.log("qualidade: ok");

// Predefinições: chaves "ti:ci" e parâmetros
{
  const vig2 = toTable([["Data", "Tmax", "Tmin", "MortDiaria no ACES"], ["2026-01-01", 12, 4, 3]]);
  const p = predefinicoes([vig2, afl], 0);
  assert.deepEqual(p.map((x) => [x.id, x.x, x.y, x.periodo, x.maxLag]), [
    ["tmin-obitos", "0:2", "0:3", "semana", 4],
    ["tmax-obitos", "0:1", "0:3", "semana", 4],
    ["tmin-urgencias", "0:2", "1:1", "dia", 14],
  ]);
  assert.deepEqual(predefinicoes([vig2], 0).map((x) => x.id), ["tmin-obitos", "tmax-obitos"]);
  assert.deepEqual(predefinicoes([afl], 0), []);
}
console.log("predefinições: ok");
console.log("selfcheck-modelos: ok");

// ---------- Ficheiro mensal da ULSSA (dados sintéticos) ----------
import { serieColuna } from "../lib/modelos.ts";
import {
  tabelaComCensura, contarCensurados, parseMes, nivelDiarioULSSA, triagemResumo, cspResumo, agregarMensal, FOLHAS_MENSAIS,
} from "../lib/modelos.ts";

// Deteção das 5 folhas, incluindo cabeçalhos sem acentos e com espaços a mais
{
  const cab = (nomes) => toTable([nomes, nomes.map(() => null)]);
  assert.equal(detectarModelo(cab(["Data", "Total", "Vermelho", "Laranja", "0-9 anos"])), "su_diario");
  assert.equal(detectarModelo(cab(["data", "A09", "J44", "Data"])), "su_diagnosticos");
  assert.equal(detectarModelo(cab(["Data", "Ocupacao  enfermarias (%)", "Ocupacao Medicina (%)"])), "internamento");
  assert.equal(detectarModelo(cab(["Mes", "ACeS", "Consultas  abertas"])), "csp_mensal");
  assert.equal(detectarModelo(cab(["Mes", "ACeS", "IRA", "K77"])), "csp_icpc2");
  // Os modelos descarregáveis (só cabeçalho) são reconhecidos
  for (const f of FOLHAS_MENSAIS) assert.ok(detectarModelo(cab(f.cabecalho)), f.folha);
  // Com Vermelho, a folha de SU diário tem precedência sobre a afluência
  assert.equal(detectarModelo(toTable([["Data", "Total", "0 a 9 anos", "10 a 19 anos", "20 a 29 anos", "Vermelho", "Laranja"], ["2026-01-01", 3, 1, 1, 1, 0, 0]])), "su_diario");
}
console.log("deteção mensal: ok");

// "<5": conta como em falta (não zero) e não estraga o tipo numérico da coluna
{
  const rows = [["Data", "A09", "J44"], ["2026-01-01", 3, "<5"], ["2026-01-02", "<5", 7], ["2026-01-03", 12, 9], ["2026-01-04", "<5", "<5"]];
  const t = tabelaComCensura(rows, toTable);
  assert.equal(contarCensurados(t), 4);
  const a09 = t.columns.find((c) => c.name === "A09");
  assert.equal(a09.type, "number");
  assert.deepEqual(serieColuna(t, /^a09$/).values, [3, 12]);
}
console.log("<5 como em falta: ok");

// Ocupação 96 → nível 2; Medicina 101 → nível 2
{
  const rows = [["Data", "Ocupação enfermarias (%)", "Ocupação Medicina (%)"], ["2026-03-30", 80, 90], ["2026-03-31", 96, 101]];
  const dias = nivelDiarioULSSA(undefined, toTable(rows));
  const ult = dias.at(-1);
  assert.equal(ult.ocupacao.nivel, 2);
  assert.equal(ult.medicina.nivel, 2);
  assert.equal(ult.nivel, 2);
  assert.ok(ult.motivo.startsWith("Ocupação 96,0 % → nível 2"), ult.motivo);
  assert.equal(dias[0].nivel, 0);
}
console.log("ocupação e medicina: ok");

// Procura +30 % face ao ano anterior → nível 2
{
  const ds = diasEntre("2025-01-01", "2026-03-31");
  const rows = [["Data", "Total", "Vermelho", "Laranja"], ...ds.map((d) => [d, d >= "2026-03-25" ? 130 : 100, 1, 1])];
  const dia = nivelDiarioULSSA(toTable(rows)).at(-1);
  assert.equal(dia.procura.base, "ano anterior");
  assert.equal(dia.procura.nivel, 2);
  assert.ok(dia.motivo.includes("+30,0 %"), dia.motivo);
}
console.log("procura +30 % → nível 2: ok");

// Triagem: % urgentes ou mais graves = (V+L+A) / todas as cores
{
  const t = toTable([
    ["Data", "Vermelho", "Laranja", "Amarelo", "Verde", "Azul", "Branco"],
    ["2026-03-30", 2, 3, 5, 10, 0, 0],
    ["2026-03-31", 0, 0, 0, 0, 0, 0],
  ]);
  const r = triagemResumo(t);
  assert.equal(r.total, 20);
  assert.equal(r.pctUrgentes, 50);
  assert.equal(r.pct.Verde, 50);
  assert.equal(r.dias[1].pctUrgentes, null);
}
console.log("triagem: ok");

// CSP: mês em vários formatos e variação face ao ano anterior
{
  assert.equal(parseMes("2026-11"), "2026-11");
  assert.equal(parseMes("11/2026"), "2026-11");
  assert.equal(parseMes(new Date("2026-11-01T00:00:00Z")), "2026-11");
  assert.equal(parseMes("texto"), null);
  const t = tabelaComCensura([
    ["Mês", "ACeS", "Grupo etário", "Consultas abertas", "Consultas programadas", "Referenciações SNS 24", "Consultas SAC"],
    ["2025-11", "Porto Ocidental", "0-14", 60, 10, 4, 2],
    ["2025-11", "Porto Ocidental", "15-64", 40, 20, 6, 3],
    ["2026-11", "Porto Ocidental", "0-14", 72, 12, 4, 2],
    ["2026-11", "Porto Ocidental", "15-64", "<5", 18, 5, 3],
  ], toTable);
  const r = cspResumo(t);
  const nov26 = r.linhas.find((l) => l.mes === "2026-11");
  assert.equal(nov26.totais.abertas, 72);
  assert.ok(Math.abs(nov26.variacao.abertas + 28) < 1e-9); // 72 (sem o "<5") contra 100 do ano anterior
}
console.log("CSP: ok");

// Agregação: a tabela mais tardia ganha nas datas repetidas
{
  const a = toTable([["Data", "Total", "Vermelho", "Laranja"], ["2026-03-31", 100, 1, 1]]);
  const b = toTable([["Data", "Total", "Vermelho", "Laranja"], ["2026-03-31", 150, 1, 1], ["2026-04-01", 90, 1, 1]]);
  const m = agregarMensal([a, b]);
  assert.equal(m.su.nRows, 2);
  assert.equal(m.su.columns.find((c) => c.name === "Total").values[0], 150);
}
console.log("agregação: ok");
console.log("selfcheck-modelos mensal: ok");

function diasEntre(a, b) { const out = []; for (let t = Date.parse(a); t <= Date.parse(b); t += DAY) out.push(iso(t)); return out; }
