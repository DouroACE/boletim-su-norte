// Verificação dos relatórios semanais com dados sintéticos: `node --no-warnings scripts/selfcheck-relatorios.mjs`
import assert from "node:assert/strict";
import {
  segundaDe, semanaAnterior, rotuloSemana, ultimaSemanaCompleta, quintaDe, sobrepoeEpocaCritica,
  textoCSP, sugestaoUSP, textoEmail, tabelaHtml, resumoNiveis, periodosRelatorio, registoVazio,
  validarCopia, exportarCopia,
} from "../lib/relatorios.ts";

// Semanas (segunda a domingo)
assert.equal(segundaDe("2026-11-22"), "2026-11-16"); // domingo
assert.equal(segundaDe("2026-11-16"), "2026-11-16"); // segunda
assert.equal(semanaAnterior("2026-01-02"), "2025-12-22");
assert.equal(quintaDe("2026-11-16"), "2026-11-19");

// rotuloSemana: caso normal, mudança de mês e mudança de ano
assert.equal(rotuloSemana("2026-11-16"), "16–22 de novembro de 2026");
assert.equal(rotuloSemana("2026-11-30"), "30 de novembro – 6 de dezembro de 2026");
assert.equal(rotuloSemana("2025-12-29"), "29 de dezembro de 2025 – 4 de janeiro de 2026");

// Última semana completa: igual na segunda e no domingo da semana atual (17/11/2026 é terça)
assert.equal(ultimaSemanaCompleta("2026-11-16"), "2026-11-09");
assert.equal(ultimaSemanaCompleta("2026-11-22"), "2026-11-09");
assert.equal(ultimaSemanaCompleta("2026-11-17"), "2026-11-09");

// Época crítica nos CSP (15/11 a 31/01)
assert.equal(sobrepoeEpocaCritica("2026-11-09"), true); // domingo 15/11 incluído
assert.equal(sobrepoeEpocaCritica("2027-01-25"), true);
assert.equal(sobrepoeEpocaCritica("2026-06-01"), false);
assert.equal(sobrepoeEpocaCritica("2027-02-01"), false);

// Afluência nos CSP: os dois ramos
assert.equal(textoCSP(4), "Afluência igual ou inferior a 4 doentes por médico por hora em todas as UF.");
assert.match(textoCSP(6), /acima do critério de alerta/);
assert.equal(textoCSP(null), "");

// Sugestão USP: sem alertas e com ÍCARO/FRIESA
const SEG = "2026-11-09";
assert.equal(sugestaoUSP([], [], [], SEG, "2026-11-17"), "Atividade programada; ausência de alertas de risco. Sem valores ÍCARO nem FRIESA publicados para esta semana.");
// Valores fora da semana não entram
assert.equal(sugestaoUSP([{ date: "2026-11-30", value: 9 }], [], [], SEG, "2026-11-17"), "Atividade programada; ausência de alertas de risco. Sem valores ÍCARO nem FRIESA publicados para esta semana.");
const comIcaro = sugestaoUSP([{ date: "2026-11-10", value: 3.24 }], [{ date: "2026-11-11", value: 1.5 }], [], SEG, "2026-11-17");
assert.match(comIcaro, /ÍCARO: máximo da semana 3,2 a 10\/11/);
assert.match(comIcaro, /FRIESA \(Porto, 65\+\): máximo da semana 1,5 a 11\/11/);
assert.doesNotMatch(comIcaro, /ausência de alertas/);
// Aviso IPMA só quando a semana contém hoje
const aviso = { distrito: "Porto", tipo: "Tempo quente", nivel: "yellow", inicio: "2026-11-16T00:00", fim: "2026-11-18T23:59", texto: "" };
assert.match(sugestaoUSP([], [], [aviso], "2026-11-16", "2026-11-17"), /Aviso amarelo do IPMA para o distrito do Porto: tempo quente/);
// Semana que não contém hoje: nada sobre o IPMA
assert.doesNotMatch(sugestaoUSP([], [], [aviso], SEG, "2026-11-17"), /IPMA/);
assert.doesNotMatch(sugestaoUSP([], [], [aviso], "2026-11-23", "2026-11-17"), /IPMA/);

// Registo de teste
const base = { ...registoVazio("2026-11-09"), cuidadosNivel: 1, cuidadosEstrategias: "Reforço da comunicação; SNS 24", uspTexto: "Atividade programada; ausência de alertas de risco.", observacoes: "Linha 1\nLinha 2" };
const r = { ...base, camasLivres: 20, macasLivres: 27, equipamentoTexto: "" };

// Texto para e-mail: 11 campos, um por linha
const email = textoEmail(r).split("\n");
assert.equal(email.length, 11);
assert.match(email[0], /^Semana: 9–15 de novembro de 2026$/);
assert.match(email[1], /nível 1 \(Amarelo\)/);
assert.match(email[8], /: 20\/27$/);
assert.match(email[10], /Observações: Linha 1 Linha 2$/);
assert.ok(!textoEmail(r).includes("undefined"));

// Tabela HTML: escapa o texto do utilizador
const html = tabelaHtml([{ ...r, uspTexto: "<script>alert(1)</script>" }]);
assert.ok(!html.includes("<script>"), "tabela não pode conter <script>");
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(html, /<th>Semana<\/th>/);

// Resumo de níveis
const regs = [
  { ...r, semana: "2026-05-04", cuidadosNivel: 0 },
  { ...r, semana: "2026-06-01", cuidadosNivel: 2 },
  { ...r, semana: "2026-06-08", cuidadosNivel: 3 },
  { ...r, semana: "2026-10-05", cuidadosNivel: 2 },
];
const res = resumoNiveis(regs, "2026-05-01", "2026-09-30");
assert.equal(res.semanas, 3);
assert.deepEqual(res.porNivel, [1, 0, 1, 1]);
assert.deepEqual(res.semanasAlto, ["2026-06-01", "2026-06-08"]);

// Períodos do plano (ano de 01/05 a 30/04)
const p = periodosRelatorio("2026-11-17");
assert.deepEqual(p[0], { nome: "Intercalar", de: "2026-05-01", ate: "2026-09-30", prazo: "31/10" });
assert.deepEqual(p[1], { nome: "Época completa", de: "2026-05-01", ate: "2027-04-30", prazo: "31/05" });
assert.equal(periodosRelatorio("2026-03-01")[0].de, "2025-05-01");

// Cópia de segurança: ida e volta válida; formato errado é recusado
const copia = exportarCopia(regs, "2026-11-17");
assert.equal(validarCopia(JSON.parse(copia))?.length, 4);
assert.equal(validarCopia({ formato: "outro", versao: 1, registos: [] }), null);
assert.equal(validarCopia({ formato: "relatorios-semanais", versao: 1, registos: [{ semana: "2026-11-10" }] }), null);
assert.equal(validarCopia({ formato: "relatorios-semanais", versao: 1, registos: [{ ...r, cuidadosNivel: 7 }] }), null);

console.log("selfcheck-relatorios: ok");
