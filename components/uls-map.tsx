"use client";
// Mapa das ULS da Região Norte. Leaflet carrega só no browser; a tabela abaixo do mapa
// (renderizada no servidor) tem a mesma informação para leitores de ecrã e teclado.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, LayerGroup } from "leaflet";
import type { UlsRow } from "@/lib/sources";

type MetricKey = "obitos" | "urgencias";
const METRICS: Record<MetricKey, { label: string; unit: string }> = {
  obitos: { label: "Óbitos certificados (SICO)", unit: "óbitos" },
  urgencias: { label: "Atendimentos em urgência", unit: "atendimentos" },
};
const LV_TXT: Record<string, string> = { normal: "Normal", atencao: "Atenção", alerta: "Alerta", "sem-dados": "Sem dados" };
const nf = (n: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("pt-PT", { maximumFractionDigits: d }));
const mes = (m: string | null) => (m ? new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-PT", { month: "long", year: "numeric" }) : "—");

export function UlsMap({ rows }: { rows: UlsRow[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [metric, setMetric] = useState<MetricKey>("obitos");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      map.current = L.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.25 }).fitBounds([[40.8, -8.95], [42.15, -6.2]]);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 13,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !layer.current) return;
    import("leaflet").then((L) => {
      layer.current!.clearLayers();
      const max = Math.max(1, ...rows.map((r) => r[metric].valor ?? 0));
      for (const r of rows) {
        const m = r[metric];
        const radius = 6 + 20 * Math.sqrt((m.valor ?? 0) / max);
        const vs = m.varPct != null ? `${m.varPct >= 0 ? "+" : "−"}${nf(Math.abs(m.varPct), 0)}% vs. mesmo mês do ano anterior (${nf(m.homologo)})` : "sem mês homólogo publicado";
        L.circleMarker([r.lat, r.lon], { radius, className: `uls-dot lv-${m.level}`, weight: 2, fillOpacity: 0.55 })
          .bindTooltip(`ULS ${r.nome}: ${nf(m.valor)} ${METRICS[metric].unit}`)
          .bindPopup(
            `<b>ULS ${r.nome}</b><br>${METRICS[metric].label} · ${mes(m.mes)}<br><b>${nf(m.valor)}</b> ${METRICS[metric].unit} — ${vs}<br>` +
              `Nível: <b>${LV_TXT[m.level]}</b>${m.z != null ? ` (z = ${nf(m.z, 1)})` : ""}` +
              (r.pctGrave != null ? `<br>Triagem vermelha + laranja: ${nf(r.pctGrave, 1)}%` : "")
          )
          .addTo(layer.current!);
      }
    });
  }, [ready, rows, metric]);

  return (
    <div className="uls-map">
      <div className="seg" role="group" aria-label="Indicador mostrado no mapa">
        {(Object.keys(METRICS) as MetricKey[]).map((k) => (
          <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)}>
            {METRICS[k].label}
          </button>
        ))}
      </div>
      <div ref={el} className="map" role="region" aria-label={`Mapa das ULS da Região Norte: ${METRICS[metric].label}. A tabela a seguir tem os mesmos dados.`} />
      <p className="hint">Tamanho do círculo = volume do último mês publicado. Cor = nível face ao mesmo mês do ano anterior. Clique numa ULS para ver o detalhe.</p>
    </div>
  );
}
