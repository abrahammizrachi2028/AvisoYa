"use client";

import { etiquetaSemana, hoyISO, lunesDe, semanaDesplazada } from "@/lib/horario";

/**
 * Navegación entre semanas. Siempre dice qué semana se está viendo y ofrece
 * volver a la actual. La misma barra para el estudiante y para el admin.
 */
export default function SemanaNav({
  lunes,
  onChange,
}: {
  lunes: string;
  onChange: (lunes: string) => void;
}) {
  const lunesHoy = lunesDe(hoyISO());
  const semanas = Math.round((Date.parse(lunes) - Date.parse(lunesHoy)) / 604800000);
  const esActual = semanas === 0;
  const relativo =
    esActual
      ? "Esta semana"
      : semanas === 1
      ? "Próxima semana"
      : semanas === -1
      ? "Semana pasada"
      : semanas > 0
      ? `En ${semanas} semanas`
      : `Hace ${-semanas} semanas`;

  return (
    <div className="card flex items-center gap-2 px-2 py-2">
      <button
        onClick={() => onChange(semanaDesplazada(lunes, -1))}
        aria-label="Semana anterior"
        className="btn btn-ghost btn-sm px-2"
      >
        <Flecha />
      </button>

      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-[13.5px] font-semibold text-ink">Semana del {etiquetaSemana(lunes)}</p>
        <p className={`text-[11px] ${esActual ? "text-brand-700" : "text-faint"}`}>{relativo}</p>
      </div>

      {!esActual && (
        <button onClick={() => onChange(lunesHoy)} className="btn btn-secondary btn-sm shrink-0">
          Hoy
        </button>
      )}
      <button
        onClick={() => onChange(semanaDesplazada(lunes, 1))}
        aria-label="Semana siguiente"
        className="btn btn-ghost btn-sm px-2"
      >
        <Flecha className="rotate-180" />
      </button>
    </div>
  );
}

function Flecha({ className = "" }: { className?: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
