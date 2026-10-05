"use client";

import { useEffect, useRef, useState } from "react";
import AdminGate from "@/components/AdminGate";
import Toast from "@/components/Toast";
import type { Student } from "@/lib/types";
import { postJSON } from "@/lib/fetchJSON";

export default function ProfesorPage() {
  return (
    <main className="flex-1">
      <AdminGate>
        <NuevoAviso />
      </AdminGate>
    </main>
  );
}

type AviaDraft = {
  encontrado?: boolean;
  resumen?: string;
  texto?: string;
  urgencia?: "normal" | "alta";
  audiencia_tipo?: "todos" | "grado" | "salon" | "individual";
  audiencia_valor?: string;
  audiencia_desc?: string;
  nota?: string;
};

function NuevoAviso() {
  const [students, setStudents] = useState<Student[]>([]);
  const [texto, setTexto] = useState("");
  const [lugar, setLugar] = useState("");
  const [hora, setHora] = useState("");
  const [urgencia, setUrgencia] = useState<"normal" | "alta">("normal");
  const [tipo, setTipo] = useState<"todos" | "grado" | "salon" | "individual">("salon");
  const [valor, setValor] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [sending, setSending] = useState(false);

  // IA
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [draft, setDraft] = useState<AviaDraft | null>(null);
  // Última vuelta con la IA, para ajustar la sugerencia sin reescribirla entera.
  const [previo, setPrevio] = useState<{ texto: string; respuesta: string } | null>(null);
  // Permite cancelar la consulta a la IA (botón y al salir de la página).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    fetch("/api/roster")
      .then((r) => r.json())
      .then((d) => setStudents(d.students || []))
      .catch(() => setMsg("No se pudo cargar la lista de estudiantes."));
  }, []);

  const grados = [...new Set(students.map((s) => s.grado))].sort();
  const salones = [...new Set(students.map((s) => s.salon))].sort();

  // Valor por defecto según el tipo, sin pisar uno válido (ej. el que trajo la IA).
  useEffect(() => {
    const opciones = tipo === "grado" ? grados : tipo === "salon" ? salones : [];
    if (opciones.length && !opciones.includes(valor)) setValor(opciones[0] || "");
  }, [tipo, students.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(payload: Record<string, unknown>) {
    if (sending) return; // un envío por click
    setSending(true);
    setMsg("");
    try {
      const d = await postJSON<{ error?: string; destinatarios?: number }>("/api/announcements", payload);
      if (d.error) {
        setMsg(`Error: ${d.error}`);
        return; // conserva lo escrito para reintentar
      }
      setMsg(`✓ Aviso enviado a ${d.destinatarios} estudiante(s)`);
      setTexto("");
      setLugar("");
      setHora("");
      setDraft(null);
      setPrevio(null);
      setAiText("");
    } finally {
      setSending(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const audiencia_valor = tipo === "todos" ? "todos" : tipo === "individual" ? ids.join(",") : valor;
    enviar({
      texto,
      lugar,
      hora_evento: hora ? new Date(hora).toISOString() : null,
      urgencia,
      audiencia_tipo: tipo,
      audiencia_valor,
    });
  }

  async function interpret() {
    if (aiBusy || sending || !aiText.trim()) return; // un request por mensaje
    const texto = aiText;
    setAiBusy(true);
    setMsg("");
    setDraft(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const d = await postJSON<AviaDraft & { error?: string; raw?: string; cancelado?: boolean }>(
        "/api/announcements/interpret",
        { texto, previo },
        30_000,
        ctrl.signal
      );
      if (d.cancelado) return;
      if (d.error) {
        setMsg(`Error: ${d.error}`);
        return;
      }
      // Guardar el turno permite ajustar el borrador ("ahora hazlo urgente").
      setPrevio(d.raw ? { texto, respuesta: d.raw } : null);
      setDraft(d);
    } finally {
      setAiBusy(false);
    }
  }

  function confirmarDraft() {
    if (!draft?.encontrado) return;
    enviar({
      texto: draft.texto,
      lugar: null,
      hora_evento: null,
      urgencia: draft.urgencia,
      audiencia_tipo: draft.audiencia_tipo,
      audiencia_valor: draft.audiencia_valor,
    });
  }

  // Pasa la sugerencia de la IA al formulario manual para ajustarla.
  function editarDraft() {
    if (!draft?.encontrado) return;
    setTexto(draft.texto || "");
    setUrgencia(draft.urgencia === "alta" ? "alta" : "normal");
    const t = draft.audiencia_tipo || "salon";
    setTipo(t);
    if (t === "individual") setIds((draft.audiencia_valor || "").split(",").filter(Boolean));
    else if (t !== "todos") setValor(draft.audiencia_valor || "");
    setDraft(null);
    setPrevio(null);
  }

  return (
    <div className="max-w-lg">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">Nuevo aviso</h1>
        <p className="mt-1 text-sm text-muted">Escríbelo con IA o créalo a mano.</p>
      </header>

      {/* Modo IA */}
      <section className="panel-accent mt-5 p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-white">
            <SparkIcon />
          </span>
          <h2 className="text-[13px] font-semibold text-brand-700">Crear aviso con IA</h2>
        </div>

        <textarea
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          rows={2}
          placeholder={
            previo
              ? "Ajusta el borrador. Ej: ahora hazlo urgente y agrega que lleven cuaderno."
              : "Ej: Avísale a 10A que mañana hay simulacro a las 9am, urgente."
          }
          className="field mt-2.5 resize-y"
        />
        {previo && (
          <p className="mt-1.5 text-[11.5px] text-brand-700">
            La IA recuerda el borrador anterior: escribe solo lo que quieres ajustar.
          </p>
        )}
        <div className="mt-2 flex justify-end">
          <div className="flex items-center gap-2">
            {aiBusy && (
              <button onClick={() => abortRef.current?.abort()} className="btn btn-ghost btn-sm">
                Cancelar
              </button>
            )}
            <button onClick={interpret} disabled={aiBusy || sending || !aiText.trim()} className="btn btn-primary btn-sm">
              {aiBusy ? "Interpretando…" : previo ? "Ajustar con IA" : "Interpretar con IA"}
            </button>
          </div>
        </div>

        {draft && (
          <div className="card-soft mt-3 animate-rise p-3.5">
            {draft.encontrado ? (
              <>
                <p className="text-[14px] leading-snug text-ink">{draft.texto}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="badge badge-brand">Para: {draft.audiencia_desc}</span>
                  <span className={`badge ${draft.urgencia === "alta" ? "badge-danger" : "badge-neutral"}`}>
                    {draft.urgencia === "alta" ? "Urgente" : "Normal"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={confirmarDraft} disabled={sending} className="btn btn-success btn-sm">
                    {sending ? "Enviando…" : "Confirmar y enviar"}
                  </button>
                  <button onClick={editarDraft} className="btn btn-secondary btn-sm">
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      setDraft(null);
                      setPrevio(null);
                    }}
                    className="btn btn-ghost btn-sm ml-auto"
                  >
                    Descartar
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[13px] leading-snug text-amber-700">{draft.nota || "No se pudo interpretar."}</p>
            )}
          </div>
        )}
      </section>

      {/* Separador */}
      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">o créalo a mano</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submit} className="card space-y-5 p-5">
        <label className="block">
          <span className="label">Mensaje</span>
          <textarea
            required
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="Ej: Hay que ir al salón 5 a las 10:40 por una presentación."
            className="field resize-y"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Lugar (opcional)</span>
            <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Salón 5" className="field" />
          </label>
          <label className="block">
            <span className="label">Hora del evento</span>
            <input type="datetime-local" value={hora} onChange={(e) => setHora(e.target.value)} className="field" />
          </label>
        </div>

        <fieldset>
          <span className="label">Urgencia</span>
          <div className="flex gap-2">
            {(["normal", "alta"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgencia(u)}
                className="choice"
                data-active={urgencia === u}
                data-tone={u === "alta" ? "danger" : undefined}
              >
                {u === "alta" ? "Urgente" : "Normal"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <span className="label">¿A quién le llega?</span>
          {/* 2x2 en el teléfono, una sola fila desde tablet. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["todos", "grado", "salon", "individual"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className="choice capitalize"
                data-active={tipo === t}
              >
                {t === "salon" ? "Salón" : t === "todos" ? "Escuela" : t}
              </button>
            ))}
          </div>

          <div className="mt-3">
            {tipo === "todos" && (
              <p className="text-[13px] text-muted">El aviso les llega a todos los estudiantes de la escuela.</p>
            )}
            {tipo === "grado" && (
              <select value={valor} onChange={(e) => setValor(e.target.value)} className="field">
                {grados.map((g) => (
                  <option key={g} value={g}>
                    Grado {g}
                  </option>
                ))}
              </select>
            )}
            {tipo === "salon" && (
              <select value={valor} onChange={(e) => setValor(e.target.value)} className="field">
                {salones.map((s) => (
                  <option key={s} value={s}>
                    Salón {s}
                  </option>
                ))}
              </select>
            )}
            {tipo === "individual" && (
              <div className="max-h-52 overflow-y-auto rounded-xl border border-line p-1.5">
                {students.map((s) => {
                  const on = ids.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition ${
                        on ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                        }
                        className="h-3.5 w-3.5 accent-[var(--color-brand-600)]"
                      />
                      <span className={on ? "font-medium text-brand-700" : "text-body"}>{s.nombre}</span>
                      <span className="ml-auto text-[11px] text-faint">{s.salon}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {tipo === "individual" && ids.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted">{ids.length} estudiante(s) seleccionado(s)</p>
            )}
          </div>
        </fieldset>

        <button disabled={sending} className="btn btn-primary w-full">
          {sending ? "Enviando…" : "Publicar aviso"}
        </button>
      </form>

      <Toast msg={msg} onClose={() => setMsg("")} />
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5 13.8 9 20 10.8 13.8 12.6 12 19l-1.8-6.4L4 10.8 10.2 9 12 2.5Z" />
    </svg>
  );
}
