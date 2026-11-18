"use client";
// Entrar com o e-mail da equipa (link enviado por e-mail) para usar os dados partilhados. Sem login, tudo fica só neste browser.
import { useEffect, useState } from "react";
import { estadoPartilha, sincronizar, supabase, type EstadoPartilha } from "@/lib/partilha";

const RECARREGADO = "partilha-recarregada";

export function Sessao() {
  const [estado, setEstado] = useState<EstadoPartilha>({ email: null, equipa: false });
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const atualizar = async () => {
      const e = await estadoPartilha();
      setEstado(e);
      if (!e.equipa) return;
      // Os componentes leem o armazenamento ao abrir: se chegaram dados novos, recarrega uma vez.
      if (await sincronizar()) {
        if (sessionStorage.getItem(RECARREGADO) !== "1") { sessionStorage.setItem(RECARREGADO, "1"); window.location.reload(); }
      } else sessionStorage.removeItem(RECARREGADO);
    };
    void atualizar();
    const { data } = sb.auth.onAuthStateChange((evento) => { if (evento === "SIGNED_IN" || evento === "SIGNED_OUT") void atualizar(); });
    const ouvir = (e: Event) => setMsg((e as CustomEvent<string>).detail);
    window.addEventListener("partilha", ouvir);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("partilha", ouvir); };
  }, []);

  async function entrar(ev: React.FormEvent) {
    ev.preventDefault();
    const sb = supabase();
    if (!sb) return;
    setMsg("A enviar…");
    const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.href.split("#")[0] } });
    setMsg(error ? `Não foi possível enviar: ${error.message}` : "Enviámos um link para o seu e-mail. Abra-o neste browser para entrar.");
  }

  async function sair() {
    await supabase()?.auth.signOut();
    setMsg("Sessão terminada. Os dados continuam neste browser.");
  }

  if (estado.email) {
    return (
      <div className="sessao">
        <span className={`chip ${estado.equipa ? "lv-normal" : "lv-atencao"}`} title={msg || undefined}>
          {estado.equipa ? "Dados partilhados da equipa" : "Sem acesso à base da equipa"}
        </span>
        <span className="sessao-email">{estado.email}</span>
        <button type="button" className="btn ghost" onClick={() => void sair()}>Sair</button>
        {!estado.equipa && <span className="hint">Peça para adicionar este e-mail à lista da equipa.</span>}
        <span className="sr-only" role="status" aria-live="polite">{msg}</span>
      </div>
    );
  }

  return (
    <div className="sessao">
      {aberto ? (
        <form onSubmit={(e) => void entrar(e)} className="sessao-form">
          <label className="sr-only" htmlFor="sessao-email">E-mail da equipa</label>
          <input id="sessao-email" type="email" required autoComplete="email" placeholder="e-mail da equipa" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn">Enviar link</button>
          <button type="button" className="btn ghost" onClick={() => setAberto(false)}>Cancelar</button>
        </form>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setAberto(true)}>Entrar (equipa)</button>
      )}
      {msg && <span className="hint" role="status" aria-live="polite">{msg}</span>}
    </div>
  );
}
