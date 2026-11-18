// Verificação dos indicadores semanais do SU e da validação das flags de IA (dados sintéticos): `node scripts/selfcheck-su-semana.mjs`
import assert from "node:assert/strict";
import { indicadoresDaSemana } from "../lib/su-semana.ts";
import { parseAiFlags, ruleFlags } from "../lib/ai.ts";

const dia = (i) => new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10); // 2026-01-05 é segunda-feira
// 9 semanas estáveis (300 ± 10 por dia) e uma 10.ª com mais procura, mais respiratórias e mais frio.
const dias = [];
for (let i = 0; i < 70; i++) {
  const ultima = i >= 63;
  dias.push({ date: dia(i), total: ultima ? 360 : 300 + ((i * 7) % 21) - 10, iras: ultima ? 12 : 5 + (i % 3), irai: 2, gastro: 3, diarreia: 0,
    internamento: 30, uci: 2, falecidos: 1, tempoTriagem: 50, a80_89: 40, a90_99: 5, a100: 0, tMin: ultima ? 2 : 8 + (i % 3), tMax: 15 });
}
const s = indicadoresDaSemana(dias);
assert.equal(s.semana, "2026-03-09");
assert.equal(s.dias, 7);
assert.equal(s.base, 8);
const nivel = (id) => s.indicadores.find((x) => x.id === id).level;
assert.equal(nivel("su:episodios"), "alerta");
assert.equal(nivel("su:respiratorias"), "alerta");
assert.equal(nivel("su:frio"), "alerta"); // descer é pior
assert.equal(nivel("su:calor"), "normal"); // sem variação (DP 0)
assert.equal(nivel("su:uci"), "normal");
assert.match(s.indicadores[0].detail, /^Semana de 09\/03\/2026: 360\/dia; média das 8 semanas anteriores/);

// Semana incompleta (3 dias) não conta: fica a anterior.
const comParcial = [...dias, ...[0, 1, 2].map((k) => ({ ...dias[0], date: dia(70 + k) }))];
assert.equal(indicadoresDaSemana(comParcial).semana, "2026-03-09");
// Poucas semanas de base: sem dados.
assert.equal(indicadoresDaSemana(dias.slice(-21)).indicadores[0].level, "sem-dados");
assert.equal(indicadoresDaSemana([]), null);

// A IA só pode citar ids conhecidos; o nível vem das regras.
const ind = s.indicadores;
const r = parseAiFlags('```json\n{"flags":[{"indicadores":["[su:episodios]","su:frio","inventado"],"titulo":"**Mais procura com frio**","evidencia":"360/dia"},{"indicadores":["su:uci"],"titulo":"UCI estável"},{"indicadores":["nada"],"titulo":"Ignorar"}]}\n```', ind);
assert.deepEqual(r.map((f) => [f.titulo, f.level, f.indicadores.join()]), [["Mais procura com frio", "alerta", "su:episodios,su:frio"], ["UCI estável", "info", "su:uci"]]);
assert.deepEqual(parseAiFlags("sem json", ind), []);
assert.deepEqual(ruleFlags(ind).map((f) => f.indicadores[0]).sort(), ["su:episodios", "su:frio", "su:respiratorias"]);
console.log("selfcheck-su-semana: ok");
