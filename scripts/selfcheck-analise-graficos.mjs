// Verificação das funções de gráficos multi-série, correlação e resumo para a IA: `node scripts/selfcheck-analise-graficos.mjs`
import assert from "node:assert/strict";
import { alinharSeries, eixoDireito, normalizarIndice, matrizCorrelacao, resumoPadroes, validarResumoPadroes } from "../lib/analise.ts";

const dia = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const pts = (vals, ini = 0) => vals.map((value, i) => ({ date: dia(ini + i), value }));

// Alinhamento: união das datas, null onde falta ponto
const al = alinharSeries([
  { label: "A", pts: pts([1, 2, 3]) },
  { label: "B", pts: pts([10, 20], 1) },
]);
assert.equal(al.length, 3);
assert.equal(al[0].date, dia(0)); assert.equal(al[0].s0, 1); assert.equal(al[0].s1, null);
assert.equal(al[1].s1, 10); assert.equal(al[2].s0, 3); assert.equal(al[2].s1, 20);

// Eixo direito: só quando o máximo é ≥10× menor que o maior
const escala = eixoDireito([
  { label: "Grande", pts: pts([1000, 900]) },
  { label: "Pequena", pts: pts([50, 20]) },
  { label: "Média", pts: pts([200, 150]) },
]);
assert.deepEqual(escala, [false, true, false]);
assert.deepEqual(eixoDireito([{ label: "a", pts: pts([100]) }, { label: "b", pts: pts([50]) }]), [false, false]);
assert.deepEqual(eixoDireito([{ label: "a", pts: pts([5]) }]), [false]);

// Normalização: índice 100 = média
const norm = normalizarIndice(pts([2, 4, 6]));
assert.deepEqual(norm.map((p) => Math.round(p.value * 100) / 100), [50, 100, 150]);
assert.deepEqual(normalizarIndice(pts([0, 0])), []);

// Matriz: correlação perfeita e inversa, n de pares com data comum
const x = pts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const y = pts([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
const z = pts([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
const m = matrizCorrelacao([{ label: "X", pts: x }, { label: "Y", pts: y }, { label: "Z", pts: z }]);
assert.deepEqual(m.nomes, ["X", "Y", "Z"]);
assert.ok(Math.abs(m.r[0][1] - 1) < 1e-9);
assert.ok(Math.abs(m.r[0][2] + 1) < 1e-9);
assert.equal(m.n[0][1], 10);

// Resumo: média, mín/máx com datas, picos, tendência e variação do último período
const r = resumoPadroes([{ label: "X", pts: pts([5, 1, 9, 3, 8, 12]) }], "semana", "media");
const s = r.series[0];
assert.equal(s.n, 6); assert.equal(s.media, 6.33);
assert.deepEqual(s.maximo, { data: dia(5), valor: 12 });
assert.deepEqual(s.minimo, { data: dia(1), valor: 1 });
assert.equal(s.picos.length, 3); assert.equal(s.picos[0].valor, 12); assert.equal(s.picos[1].valor, 9);
assert.equal(s.tendencia, "crescente");
assert.equal(s.variacaoVsPeriodoAnteriorPct, 50);
assert.equal(r.correlacao, null);
assert.equal(resumoPadroes([{ label: "A", pts: pts([3, 3, 3]) }], "dia", "soma").series[0].tendencia, "plana");
assert.equal(resumoPadroes([{ label: "A", pts: [] }], "dia", "soma").series[0].n, 0);

const rc = resumoPadroes([{ label: "X", pts: x }, { label: "Z", pts: z }], "dia", "soma");
assert.equal(rc.correlacao.r[0][1], -1);

// Validação do corpo do pedido à IA
const ok = { tipo: "padroes", periodo: "semana", funcao: "media", series: [{ nome: "X", n: 6, picos: [] }], correlacao: null };
assert.equal(validarResumoPadroes(ok), null);
assert.ok(validarResumoPadroes({ ...ok, series: [] }));
assert.ok(validarResumoPadroes({ ...ok, series: Array.from({ length: 7 }, () => ({ nome: "a", n: 1, picos: [] })) }));
assert.ok(validarResumoPadroes({ ...ok, periodo: "ano" }));
assert.ok(validarResumoPadroes({ ...ok, series: [{ nome: "x".repeat(200), n: 1, picos: [] }] }));
assert.ok(validarResumoPadroes(null));

console.log("selfcheck-analise-graficos: ok");
