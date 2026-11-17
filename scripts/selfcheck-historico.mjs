// Verificação da padronização de boletins passados (dados sintéticos): `node scripts/selfcheck-historico.mjs`
import assert from "node:assert/strict";
import { lerFolha, padronizar, juntarHistorico, resumoHistorico, sugerirMetrica, valorPadrao, csvHistorico, validarHistorico, tabelaHistorico, METRICAS } from "../lib/historico.ts";

// Nomes de colunas de anos diferentes → a mesma métrica padrão.
const casos = {
  "MortDiaria no ACES": "obitos_aces_gondomar", "MortDiaria no ACES Gondomar": "obitos_aces_gondomar",
  "MortDiaria no ACES Porto Ocidental": "obitos_aces_porto_ocidental", "Mortalidade Diaria Porto Ocidental + Gon": "obitos_ulssa",
  "Mortalidade Diaria Porto+ Gondomar": "obitos_porto_gondomar", "MortSemanal por concelho de Gondomar": "obitos_semana_gondomar",
  "Tmax": "tmax", "Tmed": "tmed", "Tmin": "tmin", "MediaSemMax": null, "MediasemMinima": null,
  "Precip diaria": "precip_dia", "PrecipAcum": "precip_acum", "Precipitação acumulada": "precip_acum",
  "Nível UltraVioleta": "uv", "Qualidade do ar exterior": "ar", "ÍCARO pop Geral": "icaro_geral", "ÍCARO >65 anos": "icaro_65", "ÍCARO >75 anos": "icaro_75",
  "Impacto frio e gripe Friesa TC": "friesa_tc", "Impacto frio e gripe Friesa TC +65": "friesa_tc_65", "Impacto frio e gripe Friesa CR+65": "friesa_cr_65",
  "Alerta IPMA": "aviso_ipma", "Alerta Temperatura (Departamento)": "alerta_temperatura", "Total episodios de SU": "episodios_su", "UCI": "uci",
  "Semana": null, "Dia da Semana": null, "TC": null, "0 a 9 anos": "su_0_9", "80 a 89 anos": "su_80_89", "90+ anos": "su_90", "8h": null,
};
for (const [nome, id] of Object.entries(casos)) assert.equal(sugerirMetrica(nome), id, nome);

const m = (id) => METRICAS.find((x) => x.id === id);
assert.equal(valorPadrao("Muito Bom", m("ar")), 1);
assert.equal(valorPadrao("Bom", m("ar")), 2);
assert.equal(valorPadrao("Não significativo", m("alerta_temperatura")), 1);
assert.equal(valorPadrao("Aviso amarelo e laranja", m("aviso_ipma")), 2);
assert.equal(valorPadrao("texto qualquer", m("tmax")), null);

// Folha com Ano/Dia/Mês (mês por extenso) e folha sem Ano (ano do nome da folha). Valores fictícios.
const f23 = lerFolha("Vigilância 2023.xlsx", "Original 2023", [
  ["Ano", "Dia", "Mês", "Semana", "MortDiaria no ACES", "Tmax", "Qualidade do ar exterior", "Alerta Temperatura"],
  [2023, 1, "Abril", 13, 4, 20.5, "Bom", "Nulo"],
  [2023, 2, "Abril", 13, 6, 22, "Médio", "Não significativo"],
  [2023, null, null, null, null, null, null, null],
  [2023, null, null, 14, null, null, null, null], // colunas Ano e Semana preenchidas até ao fim
]);
assert.ok(f23);
assert.equal(f23.dias, 2);
assert.equal(f23.de, "2023-04-01");
const sug = Object.fromEntries(f23.colunas.filter((c) => c.sugestao).map((c) => [c.indice, c.sugestao]));
const h23 = padronizar(f23, sug);
assert.deepEqual(h23.obitos_aces_gondomar, { "2023-04-01": 4, "2023-04-02": 6 });
assert.deepEqual(h23.ar, { "2023-04-01": 2, "2023-04-02": 3 });
assert.deepEqual(h23.alerta_temperatura, { "2023-04-01": 0, "2023-04-02": 1 });

const f24 = lerFolha("Vigilância.xlsx", "Original 2024", [
  ["Dia", "Mês", "MortDiaria no ACES Gondomar", "Tmax"],
  [1, "Maio", 5, 25],
  [2, "maio", 7, 27],
]);
assert.ok(f24);
assert.equal(f24.de, "2024-05-01");
const h24 = padronizar(f24, Object.fromEntries(f24.colunas.map((c) => [c.indice, c.sugestao]).filter(([, s]) => s)));
const h = juntarHistorico(h23, h24);
assert.deepEqual(Object.keys(h.obitos_aces_gondomar), ["2023-04-01", "2023-04-02", "2024-05-01", "2024-05-02"]);
// Em datas repetidas fica o valor mais recente importado.
assert.equal(juntarHistorico(h, { tmax: { "2024-05-01": 30 } }).tmax["2024-05-01"], 30);

const r = resumoHistorico(h);
const ob = r.find((x) => x.id === "obitos_aces_gondomar");
assert.equal(ob.dias, 4);
assert.deepEqual(ob.porAno["2023"], { media: 5, max: 6, n: 2 });
assert.equal(tabelaHistorico(h).nRows, 4);
assert.match(csvHistorico(h).split("\r\n")[1], /^2023-04-01;/);
assert.match(csvHistorico({ tmax: { "2024-05-01": 20.5 } }), /20,5/);

// Pivô sem datas e folha vazia: não são folhas de dados.
assert.equal(lerFolha("x.xlsx", "Folha3", [["Rótulos de Linha", "Soma de Tmax"], ["Maio", 300]]), null);
assert.equal(lerFolha("x.xlsx", "Vazia", []), null);

assert.deepEqual(validarHistorico(h), h);
assert.equal(validarHistorico({ inventada: {} }), null);
assert.equal(validarHistorico({ tmax: { "ontem": 1 } }), null);
console.log("selfcheck-historico: ok");
