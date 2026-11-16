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
