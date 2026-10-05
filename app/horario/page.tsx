"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StudentGate, { type Me } from "@/components/StudentGate";
import { diaDeFecha, fechaCorta, hoyISO, lunesDe, nombreClase, tinteMateria } from "@/lib/horario";
import SemanaNav from "@/components/SemanaNav";
import { usePolling } from "@/lib/usePolling";

const DIAS = ["", "Lun", "Mar", "Mié", "Jue", "Vie"];

type Period = { orden: number; etiqueta: string; hora_inicio: string; hora_fin: string; es_clase: boolean };
type Slot = { dia: number; periodo: number; materia: string; sala: string | null };
type Override = {
  dia: number;
  periodo: number;
  fecha: string;
  tipo: "cambio" | "cancelacion" | "evento";
  materia: string | null;
  sala: string | null;
  nota: string | null;
};

export default function HorarioPage() {
  return (
    <main className="flex-1">
      <StudentGate>{(me) => <Horario me={me} />}</StudentGate>
    </main>
  );
}

function Horario({ me }: { me: Me }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [fechas, setFechas] = useState<Record<number, string>>({});
  // Semana que se está viendo. Siempre arranca en la actual.
  const [lunes, setLunes] = useState(() => lunesDe(hoyISO()));
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoy = hoyISO();
  const diaHoy = diaDeFecha(hoy);

  const load = useCallback(async () => {
    const d = await fetch(`/api/schedule?studentId=${me.id}&semana=1&lunes=${lunes}`)
      .then((r) => r.json())
      .catch(() => null);
    if (!d?.periods) return; // un fallo de red no debe borrar el cuadro en pantalla
    if (d.lunes !== lunes) return; // respuesta de otra semana: se descarta
    setPeriods(d.periods || []);
    setSlots(d.slots || []);
    setOverrides(d.overrides || []);
    setFechas(d.fechas || {});
  }, [me.id, lunes]);

  usePolling(load);

  // En móvil, posiciona el cuadro en el día de hoy al cargar.
  useEffect(() => {
    if (!slots.length || diaHoy > 5 || fechas[diaHoy] !== hoy) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, (diaHoy - 2) * 92);
  }, [slots.length, diaHoy, fechas, hoy]);

  const slotDe = (dia: number, p: number) => slots.find((s) => s.dia === dia && s.periodo === p);
  const ovrDe = (dia: number, p: number) => overrides.find((o) => o.dia === dia && o.periodo === p);
  const horaDe = (p: number) => periods.find((x) => x.orden === p)?.hora_inicio?.slice(0, 5);

  // Cambios ordenados por fecha y hora, para el resumen de arriba.
  const ordenados = [...overrides].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.periodo - b.periodo);

  // Un día cancelado entero son 13 líneas iguales. Se resume en una sola.
  const ordenAlmuerzo = periods.find((p) => !p.es_clase && /almuerzo/i.test(p.etiqueta))?.orden;
  const lista: (Override | { jornada: "sin_clases" | "salida_temprana"; fecha: string; dia: number; desde?: string })[] =
    [];
  for (const fecha of [...new Set(ordenados.map((o) => o.fecha))]) {
    const delDia = ordenados.filter((o) => o.fecha === fecha);
    const cancel = delDia.filter((o) => o.tipo === "cancelacion");
    const dia = delDia[0].dia;
    const clasesDelDia = slots.filter((sl) => sl.dia === dia).length;
    const todasCanceladas = clasesDelDia > 0 && cancel.length >= clasesDelDia;
    const soloTarde =
      ordenAlmuerzo !== undefined && cancel.length > 1 && cancel.every((o) => o.periodo > ordenAlmuerzo);
    if (todasCanceladas || soloTarde) {
      lista.push({
        jornada: todasCanceladas ? "sin_clases" : "salida_temprana",
        fecha,
        dia,
        desde: horaDe(Math.min(...cancel.map((o) => o.periodo))),
      });
      // Lo que no sea parte de la jornada sí se lista aparte.
      lista.push(...delDia.filter((o) => o.tipo !== "cancelacion"));
    } else {
      lista.push(...delDia);
    }
  }

  return (
    <div>
      <div className="mb-4 max-w-lg">
        <SemanaNav lunes={lunes} onChange={setLunes} />
      </div>

      {lista.length > 0 && (
        <section className="mb-5 max-w-lg animate-rise overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70">
          <div className="flex items-center gap-2 border-b border-amber-200/70 px-4 py-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400/25 text-amber-700">
              <BellIcon />
            </span>
            <h2 className="text-[13px] font-semibold text-amber-900">
              Cambios en tu horario
              <span className="ml-1.5 font-normal text-amber-700/80">({lista.length})</span>
            </h2>
          </div>
          <ul className="divide-y divide-amber-200/60">
            {lista.map((o, i) => {
              if ("jornada" in o) {
                return (
                  <li key={i} className="flex gap-3 px-4 py-2.5 text-[13px] text-amber-900">
                    <span className="w-[86px] shrink-0 font-medium tabular-nums text-amber-700">
                      {o.fecha === hoy ? "Hoy" : `${DIAS[o.dia]} ${fechaCorta(o.fecha)}`}
                    </span>
                    <span className="leading-snug">
                      {o.jornada === "sin_clases" ? (
                        <b className="font-semibold">No hay clases</b>
                      ) : (
                        <>
                          <b className="font-semibold">Salida temprana</b>
                          {o.desde && <> · no hay clases desde las {o.desde}</>}
                        </>
                      )}
                    </span>
                  </li>
                );
              }
              const clase = nombreClase(slotDe(o.dia, o.periodo)?.materia, me.salon);
              return (
                <li key={i} className="flex gap-3 px-4 py-2.5 text-[13px] text-amber-900">
                  <span className="w-[86px] shrink-0 font-medium tabular-nums text-amber-700">
                    {o.fecha === hoy ? "Hoy" : `${DIAS[o.dia]} ${fechaCorta(o.fecha)}`}
                    <span className="block text-[11px] font-normal text-amber-600/90">{horaDe(o.periodo)}</span>
                  </span>
                  <span className="leading-snug">
                    {o.tipo === "cancelacion" ? (
                      <>
                        <b className="font-semibold">{clase}</b> se cancela
                      </>
                    ) : o.tipo === "evento" ? (
                      <>
                        <b className="font-semibold">{o.nota}</b> en {clase}
                      </>
                    ) : (
                      <>
                        <b className="font-semibold">{nombreClase(o.materia, me.salon) || clase}</b>
                        {o.sala && (
                          <>
                            {" "}
                            en sala <b className="font-semibold">{o.sala}</b>
                          </>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!!periods.length && !lista.length && (
        <p className="mb-4 max-w-lg rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] text-muted">
          Esta semana no tiene cambios: el horario va normal.
        </p>
      )}

      {!periods.length && (
        <div className="card p-4" aria-hidden>
          <div className="sk h-4 w-40" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="sk h-9 w-full" />
            ))}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        aria-busy={!periods.length}
        className={`scroll-soft card overflow-x-auto p-0 ${periods.length ? "" : "hidden"}`}
      >
        <table className="w-full border-collapse text-left">
          <caption className="solo-lectores">Tu horario de la semana</caption>
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
                    const ovr = ovrDe(d, p.orden);
                    const esHoy = fechas[d] === hoy;
                    if (!slot && !ovr)
                      return (
                        <td
                          key={d}
                          className={`border-l border-line/70 px-2 py-2 ${esHoy ? "bg-brand-50/40" : ""}`}
                        />
                      );

                    const cancelada = ovr?.tipo === "cancelacion";
                    const materia = ovr?.tipo === "cambio" ? ovr.materia || slot?.materia : slot?.materia;
                    const sala = ovr?.tipo === "cambio" ? ovr.sala || slot?.sala : slot?.sala;

                    return (
                      <td
                        key={d}
                        className={`border-l border-line/70 px-2 py-2 align-top ${
                          ovr
                            ? "bg-amber-50 shadow-[inset_2px_0_0_0_var(--color-amber-400)]"
                            : `tinte ${tinteMateria(materia)}`
                        } ${esHoy && !ovr ? "shadow-[inset_0_0_0_9999px_rgba(14,165,233,0.10)]" : ""}`}
                      >
                        <span
                          className={`block text-[11.5px] font-semibold leading-snug ${
                            cancelada ? "text-faint line-through" : "text-ink"
                          }`}
                        >
                          {nombreClase(materia, me.salon)}
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
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={`mt-3 flex items-center justify-center gap-1.5 text-xs text-faint lg:hidden ${periods.length ? "" : "hidden"}`}>
        Desliza para ver toda la semana
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </p>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
