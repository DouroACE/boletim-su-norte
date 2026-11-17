// Verificação do ficheiro semanal (modelo → Excel → leitura): `node scripts/selfcheck-semanal.mjs`. Dados fictícios.
import assert from "node:assert/strict";
import writeExcelFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";
import { lerSemana, dataIso, numero, tabelaSemanal, tabelaDiaria, FOLHAS_CAMPOS, FOLHA_DIARIA, COLUNAS_DIARIAS } from "../lib/semanal.ts";
import { normalizarRegisto } from "../lib/relatorios.ts";

assert.equal(dataIso("05/01/2026"), "2026-01-05");
assert.equal(dataIso("31/02/2026"), null);
assert.equal(dataIso(new Date(Date.UTC(2026, 0, 5))), "2026-01-05");
assert.equal(numero("3,5"), 3.5);
assert.equal(numero("<5"), null);

// Modelo preenchido com valores fictícios, escrito e lido como xlsx.
const valor = {
  "Semana (segunda-feira)": "07/01/2026", // quarta-feira → semana de 05/01
  "Nível de ativação por procura do SU": "2 · Laranja",
  "Estratégias de resposta": "Reforço de escalas",
  "Camas livres em média": 12,
  "Macas livres em média": "8",
  "Projeto Ligue Antes, Salve Vidas": "implementado",
  "Referenciações inter-ULS por constrangimentos": "sim",
  "Equipamento, incluindo cadeiras de rodas": "Talvez",
  "Doentes por médico por hora (máximo da semana)": "4,6",
  "VSR positivos": 7,
  "VSR negativos": 40,
};
const t = (value) => (value == null ? null : typeof value === "number" ? { value, type: Number } : { value: String(value), type: String });
const folhas = FOLHAS_CAMPOS.map(({ folha, campos }) => ({
  sheet: folha,
  data: [[t("Campo"), t("Valor"), t("Ajuda")], ...campos.map((c) => [t(c.rotulo), t(valor[c.rotulo]), t(c.ajuda)])],
}));
const dias = [5, 6, 7].map((d) => [t(`0${d}/01/2026`), t(300 + d), ...COLUNAS_DIARIAS.slice(2).map(() => null), t(9)]);
folhas.push({ sheet: FOLHA_DIARIA, data: [[...COLUNAS_DIARIAS, "Extra"].map(t), ...dias, [t("total"), t(999)]] });
const buf = await writeExcelFile(folhas).toBuffer();

const lidas = {};
for (const { sheet, data } of await readXlsxFile(buf)) lidas[sheet] = data;
const r = lerSemana(lidas);
assert.ok("registo" in r, JSON.stringify(r));
const g = r.registo;
assert.equal(g.semana, "2026-01-05");
assert.equal(g.cuidadosNivel, 2);
assert.equal(g.camasNivel, 0);
assert.equal(g.camasLivres, 12);
assert.equal(g.macasLivres, 8);
assert.equal(g.ligueAntes, "Implementado");
assert.equal(g.referenciacoes, "Sim");
assert.equal(g.equipamento, "Suficientes"); // inválido → omissão, com aviso
assert.equal(g.cspDoentesMedicoHora, 4.6);
assert.match(g.cspAfluencia, /acima do critério/);
assert.equal(g.casosSociais, "2026-01-08");
assert.deepEqual(g.laboratorio, { "VSR positivos": 7, "VSR negativos": 40 });
assert.equal(g.diario.linhas.length, 3); // a linha «total» sem data fica de fora
assert.equal(g.diario.linhas[0][0], "2026-01-05");
assert.equal(g.diario.linhas[0][1], 305);
assert.equal(g.diario.linhas[0].at(-1), 9);
assert.ok(r.avisos.some((a) => a.includes("Equipamento")));
assert.ok(r.avisos.some((a) => a.includes("não é segunda-feira")));
assert.ok(r.avisos.some((a) => a.includes("camas suplementares")));
// O registo lido passa a validação usada no armazenamento e nas cópias de segurança.
assert.ok(normalizarRegisto(JSON.parse(JSON.stringify(g))));
assert.equal(normalizarRegisto({ ...g, diario: { colunas: ["Data"], linhas: [["x"]] } }), null);

assert.ok("erro" in lerSemana({ Hospital: [["Campo", "Valor"]] }));
// Workspace: semana e diário em tabelas.
const outra = { ...g, semana: "2025-12-29", laboratorio: undefined, diario: { colunas: ["Data", "Episódios SU", "Nova"], linhas: [["2025-12-29", 280, 1]] } };
const ts = tabelaSemanal([g, outra]);
assert.equal(ts.nRows, 2);
assert.equal(ts.columns[0].values[0].toISOString().slice(0, 10), "2025-12-29"); // ordenado
const pos = ts.columns.find((c) => c.name === "Positividade VSR (%)").values;
assert.equal(pos[0], null);
assert.ok(Math.abs(pos[1] - (100 * 7) / 47) < 1e-9);
const td = tabelaDiaria([g, outra]);
assert.equal(td.nRows, 4);
assert.deepEqual(td.columns.find((c) => c.name === "Episódios SU").values, [305, 306, 307, 280]);
assert.deepEqual(td.columns.find((c) => c.name === "Nova").values, [null, null, null, 1]);
console.log("selfcheck-semanal: ok");
