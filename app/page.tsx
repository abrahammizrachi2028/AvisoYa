import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-16">
      {/* halo suave de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-brand-200/50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-[-6rem] h-64 w-64 rounded-full bg-brand-100/60 blur-3xl"
      />

      <div className="relative w-full max-w-md animate-rise">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-bold text-white shadow-lg shadow-brand-600/20">
            A
          </span>
          <h1 className="mt-5 text-[34px] font-bold leading-none tracking-tight text-ink">AvisoYa</h1>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted">
            Tu horario y los cambios de última hora, al instante.
          </p>
        </div>

        <div className="mt-9 grid gap-3">
          <Link
            href="/horario"
            className="group flex items-center gap-4 rounded-2xl bg-brand-600 px-5 py-4 text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
              <CalendarIcon />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Iniciar sesión</span>
              <span className="block text-[13px] text-brand-100">Entra con tu correo @IAE.edu</span>
            </span>
            <Arrow className="text-white/60" />
          </Link>

          <Link
            href="/profesor"
            className="group card flex items-center gap-4 px-5 py-4 transition hover:-translate-y-px hover:border-brand-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <EditIcon />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-ink">Soy admin</span>
              <span className="block text-[13px] text-muted">Cambiar el horario y publicar avisos</span>
            </span>
            <Arrow className="text-faint" />
          </Link>
        </div>

        <p className="mt-6 text-center text-[12.5px] text-muted">
          ¿Eres estudiante? Entra con tu usuario y verás tu horario y los cambios del día.
        </p>

        <p className="mt-9 text-center text-xs text-faint">AI Lab · Instituto Alberto Einstein</p>
      </div>
    </main>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${className}`}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
