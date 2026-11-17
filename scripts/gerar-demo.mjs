// Gera public/demo/semanas_FICTICIO.json: semanas FICTÍCIAS no formato do ficheiro semanal, para a demonstração do Workspace.
// `npm run demo`. Semente fixa → sempre o mesmo ficheiro. Padrões plantados: VSR em novembro, gripe com frio no início de
// janeiro, onda de calor de 10 a 14 de junho. Não correspondem a doentes nem à atividade real da ULS Santo António.
import { writeFileSync, mkdirSync } from "node:fs";
import { normalizarRegisto, quintaDe } from "../lib/relatorios.ts";

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20251006);
const ruido = (s) => (rnd() + rnd() + rnd() - 1.5) * s;
const DIA = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const r1 = (x) => Math.round(x * 10) / 10;
const pico = (t, centro, largura) => Math.exp(-(((t - Date.parse(centro)) / DIA / largura) ** 2));

const NIVEIS_TXT = ["Reforço da comunicação para a saúde e promoção da Linha SNS 24.", "Reforço de escalas no SU.", "Abertura de camas suplementares e reforço de escalas.", "Plano de contingência em nível máximo."];
const semanas = [];
for (let t = Date.parse("2025-10-06"); t <= Date.parse("2026-11-09"); t += 7 * DIA) {
  const segunda = iso(t);
  const diario = { colunas: ["Data", "Episódios SU", "Urgentes (vermelho+laranja+amarelo)", "Internamentos a partir do SU", "Óbitos no SU", "Tempo triagem-1.ª observação (min)", "Ocupação enfermarias (%)", "Doentes em boarding", "Consultas abertas CSP", "Consultas SAC", "Tmax (°C)", "Tmin (°C)"], linhas: [] };
  let maxSu = 0;
  for (let d = 0; d < 7; d++) {
    const td = t + d * DIA;
    const dia = (td - Date.parse("2026-01-01")) / DIA;
    const tmed = 15 - 6 * Math.cos((2 * Math.PI * (dia - 15)) / 365) - 5 * pico(td, "2026-01-06", 6) + 9 * pico(td, "2026-06-12", 3);
    const tmax = r1(tmed + 5 + ruido(2)), tmin = r1(tmed - 5 + ruido(2));
    const resp = 1 + 0.35 * pico(td, "2025-11-15", 14) + 0.55 * pico(td, "2026-01-08", 12);
    const calor = 1 + 0.2 * pico(td, "2026-06-12", 3);
    const fimSemana = d >= 5 ? 0.85 : 1;
    const su = Math.round((300 * resp * calor * fimSemana) + ruido(25));
    maxSu = Math.max(maxSu, su);
    const urg = Math.round(su * (0.42 + 0.06 * (resp - 1)) + ruido(8));
    const intern = Math.round(su * 0.11 + ruido(4));
    diario.linhas.push([iso(td), su, urg, intern, Math.max(0, Math.round(0.6 * resp * calor + ruido(1))), Math.round(18 + 25 * (resp - 1) + ruido(5)),
      r1(Math.min(112, 84 + 18 * (resp - 1) + 6 * (calor - 1) + ruido(3))), Math.max(0, Math.round(4 + 14 * (resp - 1) + ruido(2))),
      d >= 5 ? 0 : Math.round(420 * resp + ruido(30)), Math.round((d >= 5 ? 160 : 60) * resp + ruido(10)), tmax, tmin]);
  }
  const resp = 1 + 0.35 * pico(t, "2025-11-15", 14) + 0.55 * pico(t, "2026-01-08", 12);
  const nivel = maxSu > 440 ? 3 : maxSu > 390 ? 2 : maxSu > 345 ? 1 : 0;
  const testes = Math.round(300 * resp + ruido(20));
  const pos = (frac) => Math.max(0, Math.round(testes * frac + ruido(3)));
  const fluA = pos(0.02 + 0.28 * pico(t, "2026-01-08", 14)), vsr = pos(0.02 + 0.2 * pico(t, "2025-11-15", 14)), sars = pos(0.03 + 0.03 * rnd());
  const dmh = r1(2.5 + 2.6 * (resp - 1) + ruido(0.4));
  const registo = {
    semana: segunda,
    cuidadosNivel: nivel,
    cuidadosEstrategias: NIVEIS_TXT[nivel],
    camasNivel: Math.max(0, nivel - 1),
    camasTexto: nivel >= 2 ? "Camas suplementares ativadas em Medicina (fictício)." : "Sem camas suplementares ativadas.",
    cspDoentesMedicoHora: dmh,
    cspAfluencia: dmh > 4 ? `Afluência de ${String(dmh).replace(".", ",")} doentes por médico por hora (fictício).` : "Afluência igual ou inferior a 4 doentes por médico por hora em todas as UF.",
    cspAtividade: "Manutenção de atividade programada em todas as UF.",
    cspSac: "Sem constrangimentos.",
    uspTexto: "Texto fictício de demonstração.",
    casosSociais: quintaDe(segunda),
    ligueAntes: "Implementado",
    referenciacoes: nivel >= 3 ? "Sim" : "Não",
    camasLivres: Math.max(0, Math.round(26 - 8 * (resp - 1) + ruido(3))),
    macasLivres: Math.max(0, Math.round(20 - 10 * (resp - 1) + ruido(3))),
    equipamento: nivel >= 3 ? "Insuficientes" : "Suficientes",
    equipamentoTexto: "",
    observacoes: "DADOS FICTÍCIOS",
    laboratorio: { "Influenza A positivos": fluA, "Influenza A negativos": testes - fluA, "VSR positivos": vsr, "VSR negativos": testes - vsr, "SARS-CoV-2 positivos": sars, "SARS-CoV-2 negativos": testes - sars },
    diario,
  };
  if (!normalizarRegisto(registo)) throw new Error(`registo inválido: ${segunda}`);
  semanas.push(registo);
}
mkdirSync("public/demo", { recursive: true });
writeFileSync("public/demo/semanas_FICTICIO.json", JSON.stringify(semanas));
console.log(`public/demo/semanas_FICTICIO.json: ${semanas.length} semanas fictícias`);
