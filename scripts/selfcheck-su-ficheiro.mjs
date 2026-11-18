// Verificação da leitura do Excel de afluência ao SU e da validação dos pedidos à IA (dados sintéticos): `node scripts/selfcheck-su-ficheiro.mjs`
import assert from "node:assert/strict";
import { lerFicheiroSU, juntarSU, tabelaSU } from "../lib/su-ficheiro.ts";
import { validarPedidoFlags, validarPedidoComunicado } from "../lib/ai.ts";

const cab = ["Data", "Total", "0 a 9 anos", "80 a 89 anos", "Infeções agudas do trato respiratório superior", "Infeções agudas do trato respiratório inferior", "Diarreia", "Destino Internamento", "UCI", "Falecidos", "Temp_media", "Coluna estranha"];
const folhas = [
  { sheet: "Resumo", data: [["Relatório", "x"]] },
  { sheet: "Afluência", data: [["Título do serviço"], cab, [new Date(Date.UTC(2026, 3, 21)), 310, 2, 40, 5, 3, 1, 30, 2, 1, 14.5, "a"], ["20/04/2026", "300", null, 38, 4, 2, 0, 29, 1, 0, "13,5", "b"], ["Total", 610]] },
];
const r = lerFicheiroSU(folhas);
assert.ok("registos" in r, JSON.stringify(r));
assert.deepEqual(r.registos.map((x) => x.date), ["2026-04-20", "2026-04-21"]); // ordenado; «Total» sem data fica de fora
assert.equal(r.registos[0].total, 300);
assert.equal(r.registos[0].tMed, 13.5);
assert.equal(r.registos[1].iras, 5);
assert.deepEqual(r.ignoradas, ["coluna estranha"]);
assert.ok("erro" in lerFicheiroSU([{ sheet: "Hospital", data: [["Campo", "Valor"]] }]));

const juntos = juntarSU(r.registos, [{ date: "2026-04-21", total: 999 }, { date: "2026-04-22", total: 290 }]);
assert.deepEqual(juntos.map((x) => [x.date, x.total]), [["2026-04-20", 300], ["2026-04-21", 999], ["2026-04-22", 290]]);
assert.equal(juntos[1].iras, 5); // o registo novo junta-se ao antigo

const t = tabelaSU(r.registos);
assert.equal(t.nRows, 2);
assert.deepEqual(t.columns.find((c) => c.name === "Infeções respiratórias agudas").values, [6, 8]);
assert.deepEqual(t.columns.find((c) => c.name === "Episódios 80+ anos").values, [38, 40]);

const ind = [{ id: "su:episodios", label: "Episódios", level: "atencao", detail: "Semana de 20/04/2026: 368/dia" }];
assert.equal(validarPedidoFlags({ semana: "2026-04-20", indicadores: ind }), null);
assert.ok(validarPedidoFlags({ semana: "ontem", indicadores: ind }));
assert.ok(validarPedidoFlags({ semana: "2026-04-20", indicadores: [{ ...ind[0], id: "doente:123" }] }));
assert.ok(validarPedidoFlags({ semana: "2026-04-20", indicadores: [{ ...ind[0], level: "grave" }] }));
assert.equal(validarPedidoComunicado({ publico: "populacao", contexto: "Boletim da semana de 20/04/2026: mais procura no SU." }), null);
assert.ok(validarPedidoComunicado({ publico: "imprensa", contexto: "Boletim da semana de 20/04/2026: mais procura." }));
assert.ok(validarPedidoComunicado({ publico: "interno", contexto: "x".repeat(8001) }));
console.log("selfcheck-su-ficheiro: ok");
