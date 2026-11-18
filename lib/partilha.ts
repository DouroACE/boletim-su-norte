// Dados partilhados da equipa (Supabase, projeto Saude_Publica, UE). Só no browser.
// Sem login, a app usa só o localStorage, como antes. Com login de alguém da tabela «equipa», cada gravação vai também
// para a base e, ao abrir, a app traz o que lá está. As regras de acesso (RLS) estão em supabase/migrations.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Chave publicável: feita para estar no browser; quem lê e escreve é decidido pelas regras de acesso da base.
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://auirhpmnripyigzfpcyk.supabase.co";
const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_PaWydhIrYzIgAmPBcfF2yQ_M5SRSmEq";

export const CHAVES_PARTILHADAS = ["su-semanal-v1", "boletim-semana-v1", "relatorios-semanais-v1", "historico-padronizado-v1", "workspace-estudos-v1"] as const;
type Chave = (typeof CHAVES_PARTILHADAS)[number];

export type EstadoPartilha = { email: string | null; equipa: boolean; erro?: string };

let cliente: SupabaseClient | null = null;
let daEquipa = false;

export function supabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  cliente ??= createClient(URL_SUPABASE, CHAVE_PUBLICA, { auth: { persistSession: true, detectSessionInUrl: true } });
  return cliente;
}

const avisar = (detalhe: string) => window.dispatchEvent(new CustomEvent("partilha", { detail: detalhe }));

/** Sessão atual e se o e-mail está na lista da equipa. */
export async function estadoPartilha(): Promise<EstadoPartilha> {
  const sb = supabase();
  if (!sb) return { email: null, equipa: false };
  const { data } = await sb.auth.getSession();
  const email = data.session?.user.email?.toLowerCase() ?? null;
  if (!email) { daEquipa = false; return { email: null, equipa: false }; }
  const { data: linhas, error } = await sb.from("equipa").select("email").eq("email", email).limit(1);
  daEquipa = !error && !!linhas?.length;
  return { email, equipa: daEquipa, ...(error ? { erro: error.message } : {}) };
}

/**
 * Traz os dados partilhados para este browser. O que só existe aqui (chave sem linha na base) sobe para a base.
 * Devolve true se algum dado local mudou (a página deve voltar a ler o armazenamento).
 */
export async function sincronizar(): Promise<boolean> {
  const sb = supabase();
  if (!sb || !daEquipa) return false;
  const { data, error } = await sb.from("partilhado").select("chave, valor");
  if (error) { avisar(`Não foi possível ler os dados partilhados: ${error.message}`); return false; }
  const remotas = new Map((data ?? []).map((r: { chave: string; valor: unknown }) => [r.chave, r.valor]));
  let mudou = false;
  for (const chave of CHAVES_PARTILHADAS) {
    let local: string | null = null;
    try { local = localStorage.getItem(chave); } catch { /* sem armazenamento */ }
    if (remotas.has(chave)) {
      const texto = JSON.stringify(remotas.get(chave));
      if (texto !== local) {
        try { localStorage.setItem(chave, texto); mudou = true; } catch { /* sem armazenamento */ }
      }
    } else if (local) {
      try { await enviar(chave as Chave, JSON.parse(local)); } catch { /* conteúdo local inválido: fica só aqui */ }
    }
  }
  return mudou;
}

async function enviar(chave: Chave, valor: unknown) {
  const sb = supabase();
  if (!sb || !daEquipa) return;
  const { error } = await sb.from("partilhado").upsert({ chave, valor });
  avisar(error ? `Guardado só neste browser (a base partilhada recusou: ${error.message}).` : "Guardado na base partilhada da equipa.");
}

/** Grava neste browser e, com login da equipa, também na base partilhada. Devolve false se o browser não deixou gravar. */
export function guardar(chave: Chave, valor: unknown): boolean {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    return false;
  }
  void enviar(chave, valor);
  return true;
}

/** Apaga neste browser e, com login da equipa, também na base partilhada. */
export function apagar(chave: Chave): void {
  try { localStorage.removeItem(chave); } catch { /* nada */ }
  const sb = supabase();
  if (sb && daEquipa) void sb.from("partilhado").delete().eq("chave", chave).then(({ error }) => avisar(error ? `Não foi possível apagar na base partilhada: ${error.message}` : "Apagado também na base partilhada."));
}
