"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar, { Logo, Tabs } from "@/components/TopBar";
import { postJSON } from "@/lib/fetchJSON";
import InstallButton from "@/components/InstallButton";

export type Me = { id: string; nombre: string; salon: string };

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function StudentGate({ children }: { children: (me: Me) => React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("avisoya_student");
    if (raw) setMe(JSON.parse(raw));
    setReady(true);
    // Registrar el service worker al entrar (antes solo se hacía al activar las
    // notificaciones): es lo que permite instalar la app y recibir push.
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);

  if (!ready) return null;
  if (!me)
    return (
      <Picker
        onPick={(m) => {
          localStorage.setItem("avisoya_student", JSON.stringify(m));
          setMe(m);
        }}
      />
    );

  return (
    <>
      <TopBar
        title={me.nombre}
        subtitle={`Salón ${me.salon}`}
        actionLabel="Cambiar"
        extra={<InstallButton />}
        onAction={() => {
          localStorage.removeItem("avisoya_student");
          setMe(null);
        }}
      />
      <div className="mx-auto w-full max-w-lg px-4 pt-5 pb-10 lg:max-w-5xl">
        <div className="max-w-lg">
          <Tabs
            items={[
              { href: "/horario", label: "Mi horario" },
              { href: "/avisos", label: "Avisos" },
            ]}
          />
          <PushPrompt me={me} />
        </div>
        <div className="mt-5">{children(me)}</div>
      </div>
    </>
  );
}

function PushPrompt({ me }: { me: Me }) {
  const [state, setState] = useState<"idle" | "on" | "error" | "unsupported">("idle");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setState("on");
    }
  }, []);

  async function enable() {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("error");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: me.id, subscription: sub.toJSON() }),
      });
      setState("on");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  if (state === "on") return null;
  return (
    <div className="panel-accent mt-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
            <BellIcon />
          </span>
          <p className="text-[13px] leading-snug text-brand-700">
            Activa las notificaciones para enterarte de los cambios al instante.
          </p>
        </div>
        <button onClick={enable} disabled={busy} className="btn btn-primary btn-sm shrink-0">
          {busy ? "…" : "Activar"}
        </button>
      </div>
      {state === "error" && (
        <p className="mt-2 text-xs text-red-600">No se pudieron activar. Revisa los permisos.</p>
      )}
      {state === "unsupported" && (
        <p className="mt-2 text-xs text-red-600">
          En iPhone, agrega la app a la pantalla de inicio primero (iOS 16.4+).
        </p>
      )}
    </div>
  );
}

const DOMINIO = "IAE.edu";
// Solo la parte antes del @: nombre.apellido, opcionalmente .anio
const USUARIO_OK = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

function Picker({ onPick }: { onPick: (m: Me) => void }) {
  const [usuario, setUsuario] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const limpio = usuario.trim().toLowerCase();
  const valido = USUARIO_OK.test(limpio);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!limpio) return setErr("Escribe tu usuario del correo escolar.");
    if (!valido) return setErr("Usa solo letras, números y puntos. Ejemplo: nombre.apellido");
    setBusy(true);
    setErr("");
    try {
      // ponytail: un solo paso. Cuando se agregue el código por correo, este
      // punto pasa a pedirlo antes de llamar a onPick.
      const d = await postJSON<{ error?: string; id?: string; nombre?: string; salon?: string }>(
        "/api/student-login",
        { usuario: limpio, dominio: DOMINIO }
      );
      if (d.error) return setErr(d.error);
      onPick({ id: d.id!, nombre: d.nombre!, salon: d.salon! });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[78svh] items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="card w-full max-w-sm animate-rise p-6 sm:p-7">
        <Logo size={40} />
        <h1 className="mt-4 text-[22px] font-bold tracking-tight text-ink">Inicia sesión</h1>
        <p className="mt-1 text-sm text-muted">Entra con tu cuenta del colegio.</p>

        <label className="mt-6 block">
          <span className="label">Correo escolar</span>
          <span className="field-group">
            <input
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              value={usuario}
              onChange={(e) => {
                setUsuario(e.target.value.replace(/[@\s]/g, ""));
                setErr("");
              }}
              placeholder="nombre.apellido"
              aria-label={`Usuario del correo, sin @${DOMINIO}`}
            />
            <span className="field-suffix">@{DOMINIO}</span>
          </span>
        </label>

        <p className="mt-2 text-[12px] text-faint">
          {limpio && valido ? (
            <>
              Entrarás como <b className="font-semibold text-brand-700">{limpio}@{DOMINIO}</b>
            </>
          ) : (
            <>Solo la parte antes del @. El dominio se agrega solo.</>
          )}
        </p>
        {err && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[13px] leading-snug text-red-700">
            {err}
          </p>
        )}

        <button disabled={busy || !limpio} className="btn btn-primary mt-5 w-full">
          {busy ? "Entrando…" : "Entrar"}
        </button>

        <Link href="/" className="mt-5 block text-center text-sm text-faint transition hover:text-muted">
          Volver
        </Link>
      </form>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
