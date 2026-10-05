"use client";

import { useCallback, useState } from "react";
import StudentGate, { type Me } from "@/components/StudentGate";
import { usePolling } from "@/lib/usePolling";

type FeedItem = {
  notificationId: string;
  visto: boolean;
  resaltado: boolean;
  texto: string;
  lugar: string | null;
  hora_evento: string | null;
  urgencia: "normal" | "alta";
  created_at: string;
};

function tiempoRelativo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export default function AvisosPage() {
  return (
    <main className="flex-1">
      <StudentGate>{(me) => <Feed me={me} />}</StudentGate>
    </main>
  );
}

function Feed({ me }: { me: Me }) {
  // null = todavía cargando; [] = cargó y no hay avisos.
  const [feed, setFeed] = useState<FeedItem[] | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/feed?studentId=${me.id}`)
      .then((r) => r.json())
      .catch(() => null);
    if (!d?.feed) return; // un fallo de red no debe vaciar la lista
    setFeed(d.feed || []);
  }, [me.id]);

  usePolling(load);

  async function marcarVisto(id: string) {
    await fetch("/api/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: id }),
    });
    setFeed((f) => (f || []).map((x) => (x.notificationId === id ? { ...x, visto: true } : x)));
  }

  return (
    <div className="max-w-lg space-y-2.5" aria-busy={feed === null}>
      {feed === null &&
        [0, 1, 2].map((i) => (
          <div key={i} className="card p-4" aria-hidden>
            <div className="sk h-3 w-20" />
            <div className="sk mt-2.5 h-3.5 w-full" />
            <div className="sk mt-1.5 h-3.5 w-2/3" />
          </div>
        ))}
      {feed !== null && feed.length === 0 && (
        <div className="card animate-rise px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-500">
            <BellIcon />
          </span>
          <p className="mt-4 text-sm font-medium text-body">No tienes avisos todavía.</p>
          <p className="mt-1 text-[13px] text-faint">Aquí verás los cambios de horario y anuncios.</p>
        </div>
      )}

      {(feed || []).map((f) => {
        const urgente = f.urgencia === "alta";
        return (
          <article
            key={f.notificationId}
            className={`card relative overflow-hidden p-4 transition ${
              f.visto ? "opacity-[0.72]" : "hover:shadow-md"
            } ${!f.visto && f.resaltado ? "ring-1 ring-amber-300" : ""}`}
          >
            {!f.visto && (
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 w-[3px] ${urgente ? "bg-red-500" : "bg-brand-400"}`}
              />
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {urgente ? (
                    <span className="badge badge-danger">Urgente</span>
                  ) : (
                    !f.visto && <span className="badge badge-info">Nuevo</span>
                  )}
                  <span className="text-[11px] text-faint">{tiempoRelativo(f.created_at)}</span>
                </div>
                <p className="mt-1.5 text-[14px] leading-snug text-ink whitespace-pre-line">{f.texto}</p>
                {(f.lugar || f.hora_evento) && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
                    {f.lugar && (
                      <span className="inline-flex items-center gap-1">
                        <PinIcon /> {f.lugar}
                      </span>
                    )}
                    {f.hora_evento && (
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon /> {new Date(f.hora_evento).toLocaleString("es")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {f.visto ? (
                <span className="badge badge-ok shrink-0">
                  <CheckIcon /> Visto
                </span>
              ) : (
                <button onClick={() => marcarVisto(f.notificationId)} className="btn btn-secondary btn-sm shrink-0">
                  Marcar visto
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
