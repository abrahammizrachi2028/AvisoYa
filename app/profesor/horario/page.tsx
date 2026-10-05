"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminGate from "@/components/AdminGate";
import Toast from "@/components/Toast";
import type { Student } from "@/lib/types";
import { postJSON } from "@/lib/fetchJSON";
import SemanaNav from "@/components/SemanaNav";
import {
  codigoMateria,
  fechaCorta,
  fechasDeDiaEntre,
  hoyISO,
  lunesDe,
  nombreClase,
  nombreMateria,
  seccionDeSalon,
  sumarDias,
  tinteMateria,
} from "@/lib/horario";

const DIAS = ["", "Lun", "Mar", "Mié", "Jue", "Vie"];
const DIAS_LARGO = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

type Period = { orden: number; etiqueta: string; hora_inicio: string; hora_fin: string; es_clase: boolean };
type Slot = { dia: number; periodo: number; materia: string; sala: string | null };
type Ovr = {
  dia: number;
  periodo: number;
  fecha: string;
  tipo: "cambio" | "cancelacion" | "evento";
  materia: string | null;
  sala: string | null;
  nota: string | null;
};

type Cambio = {
  salon?: string; // la IA puede resolver un pedido en varios salones
  dia: number;
  periodo: number;
  track?: string;
  student_id?: string;
  scope: "fecha" | "permanente";
  fecha: string | null;
  repetir_hasta?: string;
  tipo: "cambio" | "cancelacion" | "evento";
  materia: string | null;
  sala: string | null;
  profesor?: string | null;
  nota?: string | null;
  resumen?: string;
  detalle?: string;
};

export default function HorarioAdminPage() {
  return (
    <main className="flex-1">
      <AdminGate>
        <Editor />
      </AdminGate>
    </main>
  );
}

function Editor() {
  const [students, setStudents] = useState<Student[]>([]);
  const [salones, setSalones] = useState<string[]>([]);
  const [salon, setSalon] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [overrides, setOverrides] = useState<Ovr[]>([]);
  const [individuales, setIndividuales] = useState<Ovr[]>([]);
  const [fechas, setFechas] = useState<Record<number, string>>({});
  // Semana que se está editando. Arranca en la actual.
  const [lunes, setLunes] = useState(() => lunesDe(hoyISO()));
  const [editing, setEditing] = useState<Slot | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // IA
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDirect, setAiDirect] = useState(false);
  const [draft, setDraft] = useState<{
    cambios?: Cambio[];
    aviso?: string | null;
    textoLote?: string | null;
    resumenLote?: string | null;
  } | null>(null);
  // Última vuelta con la IA, para que el admin pueda ajustarla ("ahora que sea el martes").
  // ponytail: solo el último turno; alcanza para la UI (hay un borrador a la vez).
  const [previo, setPrevio] = useState<{ texto: string; respuesta: string } | null>(null);
  // Permite cancelar la consulta a la IA (botón y al salir de la página).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    fetch("/api/roster")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.students as Student[]) || [];
        setStudents(list);
        const ss = [...new Set(list.map((s) => s.salon))].sort();
        setSalones(ss);
        setSalon(ss[0] || "");
      });
  }, []);

  const load = useCallback(async () => {
    if (!salon) return;
    const d = await fetch(`/api/schedule?salon=${salon}&semana=1&lunes=${lunes}`)
      .then((r) => r.json())
      .catch(() => null);
    if (!d?.periods) return;
    if (d.lunes !== lunes) return; // respuesta de otra semana: se descarta
    setPeriods(d.periods || []);
    setSlots(d.slots || []);
    setOverrides(d.overrides || []);
    setIndividuales(d.individuales || []);
    setFechas(d.fechas || {});
  }, [salon, lunes]);

  useEffect(() => {
    load();
    setEditing(null);
    // Al cambiar de salón se descarta el hilo con la IA: no se mezclan contextos.
    setDraft(null);
    setPrevio(null);
  }, [load]);

  // Aplica un lote de cambios con UNA sola notificación.
  async function applyChanges(cambios: Partial<Cambio>[], texto?: string | null) {
    if (busy) return; // evita enviar el mismo lote dos veces
    setBusy(true);
    try {
      const d = await postJSON<{ error?: string; aplicados?: number; destinatarios?: number; salones?: string[] }>(
        "/api/schedule/change",
        { salon, cambios, texto: texto || undefined }
      );
      if (d.error) {
        setMsg(`Error: ${d.error}`);
        return; // deja el borrador en pantalla para reintentar
      }
      // Si el lote tocó otros salones hay que decirlo: el cuadro solo muestra uno.
      const otros = (d.salones || []).filter((s) => s !== salon);
      setMsg(
        `✓ ${d.aplicados} cambio${(d.aplicados || 0) > 1 ? "s" : ""} aplicado${
          (d.aplicados || 0) > 1 ? "s" : ""
        } · avisado a ${d.destinatarios} estudiante(s)` + (otros.length ? ` · incluye ${otros.join(", ")}` : "")
      );
      setEditing(null);
      setDraft(null);
      setPrevio(null);
      setAiText("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function interpret() {
    if (aiBusy || busy || !aiText.trim()) return; // un request por mensaje
    const texto = aiText;
    setAiBusy(true);
    setDraft(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const d = await postJSON<{
        error?: string;
        cambios?: Cambio[];
        aviso?: string | null;
        raw?: string;
        textoLote?: string | null;
        resumenLote?: string | null;
      }>(
        "/api/schedule/interpret",
        { salon, texto, previo, lunes },
        30_000,
        ctrl.signal
      );
      if (d.cancelado) return;
      if (d.error) {
        setMsg(`Error: ${d.error}`);
        return;
      }
      // Guardar el turno permite ajustar la sugerencia sin repetirlo todo.
      setPrevio(d.raw ? { texto, respuesta: d.raw } : null);
      if (d.cambios?.length && aiDirect) return applyChanges(d.cambios, d.textoLote);
      setDraft(d);
    } finally {
      setAiBusy(false);
    }
  }

  // Cambios que dicen lo mismo se muestran juntos: "Física pasa a la sala 300 · 8 clases".
  const gruposDraft = Object.values(
    (draft?.cambios || []).reduce<Record<string, Cambio[]>>((acc, c) => {
      const k = `${c.resumen}|${c.tipo}|${c.sala}|${c.materia}|${c.nota}`;
      (acc[k] ||= []).push(c);
      return acc;
    }, {})
  );

  const slotDe = (dia: number, p: number) => slots.find((s) => s.dia === dia && s.periodo === p);
  const ovrDe = (dia: number, p: number) => overrides.find((o) => o.dia === dia && o.periodo === p);
  const nIndiv = (dia: number, p: number) => individuales.filter((o) => o.dia === dia && o.periodo === p).length;
  const isSel = (dia: number, p: number) => editing?.dia === dia && editing?.periodo === p;
  const hoy = hoyISO();

  return (
    <div>
      <div className="max-w-lg">
        <div className="mb-4">
          <SemanaNav lunes={lunes} onChange={setLunes} />
        </div>

        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-ink">Horario</h1>
            <p className="mt-1 text-sm text-muted">Toca una clase para cambiarla o anotar algo.</p>
          </div>
          <label className="shrink-0">
            <span className="sr-only">Salón</span>
            <select value={salon} onChange={(e) => setSalon(e.target.value)} className="field w-auto py-1.5 text-[13px]">
              {salones.map((s) => (
                <option key={s} value={s}>
                  Salón {s}
                </option>
              ))}
            </select>
          </label>
        </header>

        {/* IA */}
        <section className="panel-accent mt-5 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-white">
              <SparkIcon />
            </span>
            <h2 className="text-[13px] font-semibold text-brand-700">Cambiar con IA</h2>
          </div>

          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) interpret();
            }}
            rows={2}
            placeholder={
              previo
                ? "Ajusta la sugerencia. Ej: ahora que sea el martes, deja el resto igual."
                : "Ej: Física del lunes pasa al salón 300 y cancela Torá del viernes."
            }
            className="field mt-2.5 resize-y"
          />
          {previo && (
            <p className="mt-1.5 text-[11.5px] text-brand-700">
              La IA recuerda tu sugerencia anterior: escribe solo lo que quieres ajustar.
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={aiDirect}
                onChange={(e) => setAiDirect(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-brand-600)]"
              />
              Aplicar sin revisar
            </label>
            <div className="flex items-center gap-2">
              {aiBusy && (
                <button onClick={() => abortRef.current?.abort()} className="btn btn-ghost btn-sm">
                  Cancelar
                </button>
              )}
              <button onClick={interpret} disabled={aiBusy || busy || !aiText.trim()} className="btn btn-primary btn-sm">
                {aiBusy ? "Interpretando…" : previo ? "Ajustar con IA" : "Interpretar con IA"}
              </button>
            </div>
          </div>

          {draft && (
            <div className="card-soft mt-3 animate-rise p-3.5">
              {draft.cambios?.length ? (
                <>
                  <p className="text-[13px] font-semibold text-ink">
                    {draft.resumenLote ||
                      `${gruposDraft.length} cambio${gruposDraft.length > 1 ? "s" : ""} para revisar`}
                  </p>
                  {draft.resumenLote ? (
                    /* Jornada completa: una línea alcanza, no 13 clases sueltas. */
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      Se tachan las {draft.cambios.length} clases y se avisa una sola vez.
                    </p>
                  ) : (
                    <ul className="mt-2.5 space-y-2.5">
                      {gruposDraft.map((g, i) => {
                        const c = g[0];
                        const salonesG = [...new Set(g.map((x) => x.salon || salon))];
                        return (
                          <li key={i} className="border-l-2 border-brand-200 pl-2.5">
                            <p className="text-[13.5px] font-medium leading-snug text-ink">
                              {c.resumen}
                              {salonesG.some((x) => x !== salon) && (
                                <span className="badge badge-info ml-1.5 align-middle">{salonesG.join(", ")}</span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                              {g.length > 1 ? `${g.length} clases de la semana` : c.detalle} ·{" "}
                              {c.tipo === "cancelacion"
                                ? "cancelar"
                                : c.tipo === "evento"
                                ? `anotación: ${c.nota}`
                                : [c.sala && `sala ${c.sala}`, c.materia && `materia ${c.materia}`]
                                    .filter(Boolean)
                                    .join(", ")}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {draft.aviso && (
                    <p className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber-800">
                      {draft.aviso}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => applyChanges(draft.cambios!, draft.textoLote)}
                      disabled={busy}
                      className="btn btn-success btn-sm"
                    >
                      {busy ? "Aplicando…" : `Aplicar ${draft.cambios.length > 1 ? "todos" : "cambio"}`}
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
                <p className="text-[13px] leading-snug text-amber-700">
                  {draft.aviso || "No se pudo identificar la clase."}
                </p>
              )}
            </div>
          )}
        </section>

        <div className="mt-6 flex items-center gap-3 text-[11.5px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-amber-200 ring-1 ring-amber-400" />
            cambio de la semana
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-violet-200 ring-1 ring-violet-300" />
            individual
          </span>
        </div>
      </div>

      {/* Cuadro */}
      <div className="scroll-soft card mt-2 overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <caption className="solo-lectores">Horario del salón, por día y período</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-[62px] border-b border-line bg-white">
                <span className="solo-lectores">Período</span>
              </th>
              {[1, 2, 3, 4, 5].map((d) => {
                const esHoy = fechas[d] === hoy;
                return (
                  <th
                    key={d}
                    scope="col"
                    className={`min-w-[92px] border-b px-2 py-2.5 text-center ${
                      esHoy ? "border-brand-500 bg-brand-100" : "border-line bg-white"
                    }`}
                  >
                    <span className={`text-[13px] font-semibold ${esHoy ? "text-brand-700" : "text-body"}`}>
                      {DIAS[d]}
                    </span>
                    {fechas[d] && (
                      <span
                        className={`block text-[10px] font-medium tabular-nums ${
                          esHoy ? "text-brand-600/80" : "text-faint"
                        }`}
                      >
                        {esHoy ? "hoy" : fechaCorta(fechas[d])}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              if (!p.es_clase) {
                return (
                  <tr key={p.orden}>
                    <td
                      colSpan={6}
                      className="border-y border-line bg-[#fafbfc] px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-faint"
                    >
                      {p.etiqueta} · {p.hora_inicio.slice(0, 5)}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={p.orden} className="border-t border-line/70">
                  <th scope="row" className="sticky left-0 z-10 w-[62px] bg-white px-2 py-2 text-left align-top">
                    <span className="block text-[10px] font-semibold leading-tight text-body">{p.etiqueta}</span>
                    <span className="block text-[10px] tabular-nums leading-tight text-faint">
                      {p.hora_inicio.slice(0, 5)}
                    </span>
                  </th>
                  {[1, 2, 3, 4, 5].map((d) => {
                    const slot = slotDe(d, p.orden);
                    const esHoy = fechas[d] === hoy;
                    if (!slot)
                      return (
                        <td key={d} className={`border-l border-line/70 px-2 py-2 ${esHoy ? "bg-brand-50/40" : ""}`} />
                      );
                    const ovr = ovrDe(d, p.orden);
                    const indiv = nIndiv(d, p.orden);
                    const sel = isSel(d, p.orden);
                    const cancelada = ovr?.tipo === "cancelacion";
                    const materia = ovr?.tipo === "cambio" ? ovr.materia || slot.materia : slot.materia;
                    const sala = ovr?.tipo === "cambio" ? ovr.sala || slot.sala : slot.sala;
                    return (
                      <td key={d} className="border-l border-line/70 p-0 align-top">
                        <button
                          onClick={() => setEditing(sel ? null : slot)}
                          title={`${DIAS_LARGO[d]} · ${p.etiqueta} · ${nombreClase(slot.materia, salon)}`}
                          className={`celda-clase h-full w-full px-2 py-2 text-left transition hover:brightness-[0.97] ${
                            sel
                              ? "bg-brand-100 shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]"
                              : ovr
                              ? "bg-amber-50 shadow-[inset_2px_0_0_0_var(--color-amber-400)]"
                              : `tinte ${tinteMateria(materia)}`
                          } ${esHoy && !sel && !ovr ? "shadow-[inset_0_0_0_9999px_rgba(14,165,233,0.10)]" : ""}`}
                        >
                          <span
                            className={`block text-[11.5px] font-semibold leading-snug ${
                              cancelada ? "text-faint line-through" : "text-ink"
                            }`}
                          >
                            {nombreClase(materia, salon)}
                          </span>
                          {sala && !cancelada && (
                            <span className="tinte-sala mt-px block text-[10.5px] font-medium leading-snug">{sala}</span>
                          )}
                          {cancelada && (
                            <span className="mt-0.5 inline-block text-[10px] font-semibold text-red-600">Cancelada</span>
                          )}
                          {ovr?.tipo === "evento" && (
                            <span className="mt-0.5 block text-[10px] font-medium leading-snug text-amber-700">
                              📌 {ovr.nota}
                            </span>
                          )}
                          {indiv > 0 && (
                            <span className="badge mt-1 bg-violet-100 text-violet-700">
                              {indiv} individual{indiv > 1 ? "es" : ""}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="card mt-4 max-w-lg animate-rise p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{nombreClase(editing.materia, salon)}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {DIAS_LARGO[editing.dia]} · {periods.find((p) => p.orden === editing.periodo)?.etiqueta} ·{" "}
                {periods.find((p) => p.orden === editing.periodo)?.hora_inicio.slice(0, 5)}
                {editing.sala && ` · ${editing.sala}`}
              </p>
            </div>
            <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm shrink-0">
              Cerrar
            </button>
          </div>
          <EditForm
            key={`${editing.dia}-${editing.periodo}`}
            slot={editing}
            salon={salon}
            materias={[...new Set(slots.map((s) => s.materia))].sort((a, b) =>
              nombreMateria(a).localeCompare(nombreMateria(b))
            )}
            fechaInicial={fechas[editing.dia] || hoy}
            students={students.filter((s) => s.salon === salon)}
            busy={busy}
            onApply={(b) => applyChanges([b])}
          />
        </div>
      )}

      <Toast msg={msg} onClose={() => setMsg("")} />
    </div>
  );
}

function EditForm({
  slot,
  salon,
  materias,
  fechaInicial,
  students,
  busy,
  onApply,
}: {
  slot: Slot;
  salon: string;
  materias: string[];
  fechaInicial: string;
  students: Student[];
  busy: boolean;
  onApply: (b: Partial<Cambio>) => void;
}) {
  const [audiencia, setAudiencia] = useState<"salon" | "estudiante">("salon");
  const [studentId, setStudentId] = useState("");
  const [scope, setScope] = useState<"fecha" | "semanas" | "permanente">("fecha");
  const [fecha, setFecha] = useState(fechaInicial);
  const [hasta, setHasta] = useState(() => sumarDias(fechaInicial, 21));
  const [tipo, setTipo] = useState<"cambio" | "cancelacion" | "evento">("cambio");
  const [sala, setSala] = useState(slot.sala || "");
  const [materia, setMateria] = useState(slot.materia);
  // "Otra materia…" deja escribir un nombre suelto; el código con el año lectivo
  // lo arma el sistema, el admin nunca escribe el año.
  const [otra, setOtra] = useState(false);
  const [nota, setNota] = useState("");

  const esEvento = tipo === "evento";
  const paraEstudiante = audiencia === "estudiante";
  // eventos y cambios por estudiante son siempre de una fecha
  const efScope = esEvento || paraEstudiante ? "fecha" : scope;
  const porFecha = efScope === "fecha" || efScope === "semanas";

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <fieldset>
        <span className="label">¿A quién?</span>
        <div className="flex gap-2">
          {(["salon", "estudiante"] as const).map((a) => (
            <button key={a} onClick={() => setAudiencia(a)} className="choice" data-active={audiencia === a}>
              {a === "salon" ? "Todo el salón" : "Un estudiante"}
            </button>
          ))}
        </div>
        {paraEstudiante && (
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="field mt-2">
            <option value="">Elige un estudiante…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <fieldset>
        <span className="label">¿Qué pasa?</span>
        <div className="flex gap-2">
          <button onClick={() => setTipo("cambio")} className="choice" data-active={tipo === "cambio"}>
            Cambio
          </button>
          <button onClick={() => setTipo("cancelacion")} className="choice" data-active={tipo === "cancelacion"} data-tone="danger">
            Cancelar
          </button>
          <button onClick={() => setTipo("evento")} className="choice" data-active={tipo === "evento"} data-tone="warn">
            Anotación
          </button>
        </div>
      </fieldset>

      {!esEvento && !paraEstudiante && (
        <fieldset>
          <span className="label">¿Cuándo?</span>
          <div className="grid grid-cols-3 gap-2">
            {(["fecha", "semanas", "permanente"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className="choice" data-active={scope === s}>
                {s === "fecha" ? "Esta semana" : s === "semanas" ? "Varias semanas" : "Permanente"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted">
            {scope === "fecha"
              ? "Solo esa fecha. Las demás semanas siguen normales."
              : scope === "semanas"
              ? `Se repite cada ${DIAS_LARGO[slot.dia].toLowerCase()} entre las dos fechas. Después puedes editar una semana suelta sin tocar el resto.`
              : "Cambia el horario de base: así se verá todas las semanas."}
          </p>
        </fieldset>
      )}

      {porFecha && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{efScope === "semanas" ? "Desde" : "Fecha"}</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" />
          </label>
          {efScope === "semanas" && (
            <label className="block">
              <span className="label">Hasta</span>
              <input
                type="date"
                min={fecha}
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="field"
              />
            </label>
          )}
        </div>
      )}
      {efScope === "semanas" && hasta >= fecha && (
        <p className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-[12px] text-brand-700">
          Se aplicará en {fechasDeDiaEntre(slot.dia, fecha, hasta).length} semana(s):{" "}
          {fechasDeDiaEntre(slot.dia, fecha, hasta).map(fechaCorta).join(", ")}
        </p>
      )}

      {tipo === "cambio" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Sala</span>
            <input value={sala} onChange={(e) => setSala(e.target.value)} placeholder="Ej: 300" className="field" />
          </label>
          <label className="block">
            <span className="label">Materia</span>
            <select
              value={otra ? "__otra" : materia}
              onChange={(e) => {
                if (e.target.value === "__otra") {
                  setOtra(true);
                  setMateria("");
                } else {
                  setOtra(false);
                  setMateria(e.target.value);
                }
              }}
              className="field"
            >
              {materias.map((m) => (
                <option key={m} value={m}>
                  {nombreClase(m, salon)}
                </option>
              ))}
              <option value="__otra">Otra materia…</option>
            </select>
            {otra && (
              <input
                autoFocus
                value={materia}
                onChange={(e) => setMateria(e.target.value)}
                placeholder="Nombre de la materia"
                className="field mt-2"
              />
            )}
          </label>
        </div>
      )}

      <label className="block">
        <span className="label">{esEvento ? "Anotación" : "Nota (opcional)"}</span>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={esEvento ? "Ej: Prueba de Duolingo" : "Se agrega al aviso"}
          className="field"
        />
      </label>

      <button
        disabled={
          busy ||
          (esEvento && !nota.trim()) ||
          (paraEstudiante && !studentId) ||
          (efScope === "semanas" && (hasta < fecha || !fechasDeDiaEntre(slot.dia, fecha, hasta).length))
        }
        onClick={() =>
          onApply({
            dia: slot.dia,
            periodo: slot.periodo,
            student_id: paraEstudiante ? studentId : undefined,
            scope: efScope === "permanente" ? "permanente" : "fecha",
            fecha: porFecha ? fecha : null,
            repetir_hasta: efScope === "semanas" ? hasta : undefined,
            tipo,
            materia:
              tipo === "cambio"
                ? otra && materia.trim()
                  ? codigoMateria(materia, salon.replace(/[A-Za-z]\d?$/, "").trim(), seccionDeSalon(salon))
                  : materia
                : null,
            sala: tipo === "cambio" ? sala : null,
            nota: nota || undefined,
          })
        }
        className="btn btn-primary w-full"
      >
        {busy
          ? "Aplicando…"
          : esEvento
          ? "Publicar anotación"
          : efScope === "semanas"
          ? `Aplicar en ${fechasDeDiaEntre(slot.dia, fecha, hasta).length} semana(s) y notificar`
          : "Aplicar y notificar"}
      </button>
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
