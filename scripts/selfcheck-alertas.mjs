// Verificação dos textos de alerta: `node --no-warnings scripts/selfcheck-alertas.mjs`
import assert from "node:assert/strict";
import { recomendacoes, gerarAlerta, perigoDeAviso, nivelDeAviso, perigosAtivos } from "../lib/alertas.ts";

// Tipos de aviso do IPMA -> perigo
assert.equal(perigoDeAviso("Tempo quente"), "calor");
assert.equal(perigoDeAviso("Tempo frio"), "frio");
assert.equal(perigoDeAviso("Neve"), "frio");
assert.equal(perigoDeAviso("Precipitação"), "tempestade");
assert.equal(perigoDeAviso("Vento"), "tempestade");
assert.equal(perigoDeAviso("Agitação marítima"), "tempestade");
assert.equal(perigoDeAviso("Trovoada"), "tempestade");
assert.equal(perigoDeAviso("Perigo de incêndio rural"), "incendio");
assert.equal(perigoDeAviso("Nevoeiro"), "geral");

// Níveis do IPMA
assert.equal(nivelDeAviso("yellow"), "amarelo");
assert.equal(nivelDeAviso("orange"), "laranja");
assert.equal(nivelDeAviso("red"), "vermelho");
assert.equal(nivelDeAviso("green"), null);

// Recomendações: não vazias e com a emergência no fim
for (const p of ["calor", "frio", "tempestade", "incendio", "ar", "geral"]) {
  const r = recomendacoes(p);
  assert.ok(r.length >= 3, `${p}: poucas recomendações`);
  assert.ok(r.every((x) => x.trim().length > 0), `${p}: recomendação vazia`);
  assert.match(r.at(-1), /112/);
}

// Aviso IPMA de calor
const a = gerarAlerta({ perigo: "calor", nivel: "amarelo", inicio: "2026-08-03", fim: "2026-08-04", fonte: "aviso" });
assert.equal(a.assunto, "Saúde Sazonal: Aviso Amarelo de tempo quente — Porto e Gondomar, entre os dias 03/08/2026 e 04/08/2026");
assert.match(a.email, /entre os dias 03\/08\/2026 e 04\/08\/2026/);
assert.match(a.email, /808 24 24 24/);
assert.match(a.email, /1\. Beba água/);
assert.match(a.email, /Equipa de Saúde Sazonal — USP ULS Santo António/);
assert.match(a.interno, /Caros colegas/);
assert.ok(a.redes.length < 500, "legenda demasiado longa");
assert.match(a.redes, /#SaúdeSazonal/);
assert.match(a.redes, /#AvisoAmarelo/);

// Nenhum destinatário nos textos (os contactos ficam na folha da equipa)
for (const t of [a.assunto, a.email, a.redes, a.interno]) assert.ok(!t.includes("@"), "não deve haver endereços");

// Boletim ÍCARO (impacto significativo na mortalidade)
const i = gerarAlerta({ perigo: "calor", nivel: "significativo", inicio: "2026-08-03", fim: "2026-08-03", fonte: "icaro" });
assert.equal(i.assunto, "Saúde Sazonal: Impacto Significativo na Saúde");
assert.match(i.email, /dia 03\/08\/2026/);
assert.match(i.email, /75 ou mais/);
assert.match(i.email, /INSA/);

// Incêndio rural, sem datas indicadas
const f = gerarAlerta({ perigo: "incendio", nivel: "maximo", inicio: "", fim: "", fonte: "aviso" });
assert.equal(f.assunto, "Saúde Sazonal: Aviso de Máximo Perigo de Incêndio Rural");
assert.match(f.email, /dia a indicar/);
assert.match(f.email, /queimas/);

// Recomendações à população: perigos dos avisos ativos, ou o perigo sazonal do mês
assert.deepEqual(perigosAtivos([{ tipo: "Tempo quente" }], 7), ["calor"]);
assert.deepEqual(perigosAtivos([{ tipo: "Tempo quente" }], 1), ["calor", "frio"]);
assert.deepEqual(perigosAtivos([], 1), ["frio"]);
assert.deepEqual(perigosAtivos([], 7), ["calor"]);
assert.deepEqual(perigosAtivos([], 5), []);
assert.deepEqual(perigosAtivos([{ tipo: "Agitação marítima" }, { tipo: "Tempo frio" }], 1), ["tempestade", "frio"]);
assert.deepEqual(perigosAtivos([{ tipo: "Nevoeiro" }, { tipo: "Tempo frio" }], 1), ["frio"]);
assert.deepEqual(perigosAtivos([{ tipo: "Tempo frio" }, { tipo: "Tempo frio" }], 7), ["frio", "calor"]);
assert.deepEqual(perigosAtivos([{ tipo: "Agitação marítima" }], 11), ["tempestade", "frio"]);

console.log("selfcheck-alertas: ok");
