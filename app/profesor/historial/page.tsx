"use client";

import { useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import { postJSON } from "@/lib/fetchJSON";

type Ann = {
  id: string;
  texto: string;
  lugar: string | null;
  hora_evento: string | null;
  urgencia: "normal" | "alta";
  audiencia_desc: string;
  created_at: string;
  total: number;
  vistos: number;
  escalados: number;
  pendientes: number; // sin ver Y sin revisar: lo único que la IA puede atender
};

type Decision = { estudiante: string; action: string; reason: string; tutor?: string | null };

// Qué significa cada decisión de la IA, en español de verdad.
const ACCIONES: Record<string, { texto: string; badge: string }> = {
  reenviar: { texto: "Notificación reenviada", badge: "badge-info" },
  // El sistema no contacta al tutor: se lo pide al admin.
  tutor: { texto: "Avisa al tutor", badge: "badge-warn" },
  resaltar: { texto: "Queda resaltado en su app", badge: "badge-brand" },
  ninguna: { texto: "Esperar: todavía hay tiempo", badge: "badge-neutral" },
};
const accionTexto = (a: string | null) => (a && ACCIONES[a]?.texto) || a || "";

type Recipient = {
  nombre: string;
  salon: string;
  tutor: string | null;
  visto: boolean;
  escalated: boolean;
  escalation_action: string | null;
  escalation_reason: string | null;
};

export default function HistorialPage() {
  return (
    <main className="flex-1">
      <AdminGate>
        <Historial />
      </AdminGate>
    </main>
  );
}

function Historial() {
  const [anns, setAnns] = useState<Ann[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recips, setRecips] = useState<Recipient[]>([]);
  const [escalando, setEscalando] = useState<string | null>(null);
  // Las decisiones se muestran dentro de la tarjeta del aviso, no al final de la página.
  const [decisiones, setDecisiones] = useState<{ id: string; lista: Decision[] } | null>(null);

  async function load() {
    const d = await fetch("/api/announcements")
      .then((r) => r.json())
      .catch(() => ({}));
    setAnns(d.announcements || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setRecips([]);
    const d = await fetch(`/api/recipients?announcementId=${id}`)
      .then((r) => r.json())
      .catch(() => ({}));
    setRecips(d.recipients || []);
  }

  async function escalar(id: string) {
    if (escalando) return; // un análisis a la vez
    setEscalando(id);
    setDecisiones(null);
    try {
      const d = await postJSON<{ error?: string; decisiones?: Decision[] }>(
        "/api/escalate",
        { announcementId: id, ignoreWindow: true },
        60_000 // decide estudiante por estudiante: puede tardar
      );
      if (d.error) {
        setDecisiones({ id, lista: [{ estudiante: "—", action: "error", reason: d.error }] });
        return;
      }
      setDecisiones({ id, lista: d.decisiones || [] });
      await load();
      if (openId === id) {
        const rec = await fetch(`/api/recipients?announcementId=${id}`)
          .then((r) => r.json())
          .catch(() => ({}));
        setRecips(rec.recipients || []);
      }
    } finally {
      setEscalando(null);
    }
  }

  return (
    <div className="max-w-lg">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">Historial</h1>
        <p className="mt-1 text-sm text-muted">Qué se envió y quién lo vio.</p>
      </header>

      <div className="mt-5 space-y-2.5">
        {anns.length === 0 && (
          <div className="card px-6 py-14 text-center">
            <p className="text-sm font-medium text-body">Todavía no hay avisos.</p>
            <p className="mt-1 text-[13px] text-faint">Los avisos y cambios que envíes aparecerán aquí.</p>
          </div>
        )}

        {anns.map((a) => {
          const pct = a.total ? Math.round((a.vistos / a.total) * 100) : 0;
          const abierto = openId === a.id;
          return (
            <article key={a.id} className="card overflow-hidden">
              <button onClick={() => toggle(a.id)} className="w-full p-4 text-left transition hover:bg-slate-50/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.urgencia === "alta" && <span className="badge badge-danger">Urgente</span>}
                      <span className="badge badge-neutral">{a.audiencia_desc}</span>
                    </div>
                    <p className="mt-2 text-[14px] leading-snug text-ink whitespace-pre-line">{a.texto}</p>
                    <p className="mt-1.5 text-[11px] text-faint">{new Date(a.created_at).toLocaleString("es")}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[13px] font-semibold tabular-nums text-ink">
                      {a.vistos}/{a.total}
                    </span>
                    <span className="block text-[10px] text-faint">vistos</span>
                    <span className="mt-1.5 block h-1 w-12 overflow-hidden rounded-full bg-slate-200">
                      <span
                        className={`block h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </div>
                </div>
              </button>

              {a.urgencia === "alta" && a.pendientes > 0 && (
                <div className="border-t border-line bg-amber-50/50 px-4 py-3">
                  <p className="text-[12.5px] leading-snug text-body">
                    <b className="font-semibold">
                      {a.pendientes} {a.pendientes === 1 ? "estudiante" : "estudiantes"}
                    </b>{" "}
                    no {a.pendientes === 1 ? "ha" : "han"} abierto este aviso urgente. La IA mira cuánto falta para
                    el evento y si suelen leer los avisos, y decide para cada uno: reenviar la notificación, avisar al
                    tutor, dejarlo resaltado en su app o esperar.
                  </p>
                  <button
                    onClick={() => escalar(a.id)}
                    disabled={escalando === a.id}
                    className="btn btn-warn btn-sm mt-2.5"
                  >
                    {escalando === a.id
                      ? "La IA está decidiendo…"
                      : `Decidir qué hacer con ${a.pendientes === 1 ? "el pendiente" : `los ${a.pendientes} pendientes`}`}
                  </button>
                </div>
              )}

              {a.urgencia === "alta" && a.pendientes === 0 && a.escalados > 0 && (
                <div className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[12px] text-muted">
                  <CheckIcon />
                  La IA ya revisó a {a.escalados} {a.escalados === 1 ? "estudiante" : "estudiantes"}.
                  <button onClick={() => toggle(a.id)} className="font-semibold text-brand-700 hover:underline">
                    {abierto ? "Ocultar" : "Ver qué decidió"}
                  </button>
                </div>
              )}

              {decisiones?.id === a.id && (
                <div className="animate-rise border-t border-line bg-brand-50/60 px-4 py-3">
                  <p className="text-[12.5px] font-semibold text-brand-700">Lo que decidió la IA</p>
                  {decisiones.lista.length === 0 ? (
                    <p className="mt-1 text-[12.5px] leading-snug text-body">
                      No quedaba nadie pendiente por revisar.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {decisiones.lista.map((d, i) => (
                        <li key={i} className="text-[12.5px] leading-snug text-body">
                          <span className="font-semibold text-ink">{d.estudiante}</span>{" "}
                          <span className={`badge ${ACCIONES[d.action]?.badge || "badge-danger"}`}>
                            {accionTexto(d.action)}
                            {d.action === "tutor" && d.tutor ? `: ${d.tutor}` : ""}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-muted">{d.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {abierto && (
                <ul className="divide-y divide-line border-t border-line bg-slate-50/50">
                  {recips.length === 0 && <li className="px-4 py-3 text-[13px] text-faint">Cargando…</li>}
                  {recips.map((r, i) => (
                    <li key={i} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="min-w-0 truncate text-body">
                          {r.nombre} <span className="text-faint">· {r.salon}</span>
                        </span>
                        <span className={`badge shrink-0 ${r.visto ? "badge-ok" : "badge-neutral"}`}>
                          {r.visto ? "Visto" : "Sin ver"}
                        </span>
                      </div>
                      {r.escalated && r.escalation_action && (
                        <p className="mt-1 text-[11.5px] leading-snug text-muted">
                          <b className="font-semibold text-amber-700">{accionTexto(r.escalation_action)}</b>
                          {r.escalation_reason ? ` · ${r.escalation_reason}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>

    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-emerald-500"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
