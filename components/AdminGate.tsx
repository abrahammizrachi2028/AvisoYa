"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar, { Logo, Tabs } from "@/components/TopBar";
import { postJSON } from "@/lib/fetchJSON";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    // localStorage solo evita el parpadeo; quien manda es la cookie del servidor.
    const marca = localStorage.getItem("avisoya_profe") === "1";
    setAuthed(marca);
    if (!marca) return;
    postJSON<{ ok?: boolean }>("/api/profesor-login", { check: true }).then((d) => {
      if (d.ok) return;
      localStorage.removeItem("avisoya_profe");
      setAuthed(false);
    });
  }, []);

  if (authed === null) return null;
  if (!authed) return <Gate onOk={() => setAuthed(true)} />;

  return (
    <>
      <TopBar
        title="Panel del admin"
        subtitle="Instituto Alberto Einstein"
        actionLabel="Salir"
        onAction={async () => {
          localStorage.removeItem("avisoya_profe");
          setAuthed(false);
          // La cookie httpOnly es la que autoriza de verdad: hay que borrarla.
          await postJSON("/api/profesor-login", { logout: true });
        }}
      />
      <div className="mx-auto w-full max-w-lg px-4 pt-5 pb-10 lg:max-w-5xl">
        <div className="max-w-lg">
          <Tabs
            items={[
              { href: "/profesor/horario", label: "Horario" },
              { href: "/profesor", label: "Nuevo aviso" },
              { href: "/profesor/historial", label: "Historial" },
            ]}
          />
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </>
  );
}

function Gate({ onOk }: { onOk: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pass) return;
    setBusy(true);
    setErr("");
    try {
      const d = await postJSON<{ ok?: boolean; error?: string }>("/api/profesor-login", { passcode: pass });
      if (d.error) return setErr(d.error);
      if (!d.ok) return setErr("Passcode incorrecto.");
      localStorage.setItem("avisoya_profe", "1");
      onOk();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[78svh] items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="card w-full max-w-sm animate-rise p-6 sm:p-7">
        <Logo size={40} />
        <h1 className="mt-4 text-[22px] font-bold tracking-tight text-ink">Panel del admin</h1>
        <p className="mt-1 text-sm text-muted">Ingresa el passcode para continuar.</p>

        <label className="mt-6 block">
          <span className="label">Passcode</span>
          <input
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            className="field"
          />
        </label>
        {err && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[13px] leading-snug text-red-700">
            {err}
          </p>
        )}

        <button disabled={busy || !pass} className="btn btn-primary mt-5 w-full">
          {busy ? "Entrando…" : "Entrar"}
        </button>

        <Link href="/" className="mt-5 block text-center text-sm text-faint transition hover:text-muted">
          Volver
        </Link>
      </form>
    </div>
  );
}
