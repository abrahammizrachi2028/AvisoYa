"use client";

import { useEffect, useState } from "react";

// Evento de Chrome/Edge/Android para instalar la PWA. No está en los tipos del DOM.
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __avisoyaInstall?: BIP | null;
  }
}

/**
 * Botón "Instalar app". En Chrome/Edge/Android abre el diálogo nativo; en
 * iPhone/iPad (que no tiene API de instalación) muestra cómo hacerlo a mano.
 * Si la app ya está instalada, o el navegador no permite instalar, no aparece.
 */
export default function InstallButton() {
  const [modo, setModo] = useState<null | "prompt" | "ios">(null);
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    const instalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (instalada) return;

    // El evento puede llegar antes de que React monte: lo guarda un script en el layout.
    if (window.__avisoyaInstall) setModo("prompt");
    const alPoder = (e: Event) => {
      e.preventDefault();
      window.__avisoyaInstall = e as BIP;
      setModo("prompt");
    };
    const alInstalar = () => {
      window.__avisoyaInstall = null;
      setModo(null);
    };
    window.addEventListener("beforeinstallprompt", alPoder);
    window.addEventListener("appinstalled", alInstalar);

    // iPadOS se presenta como Mac; se distingue por la pantalla táctil.
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios && !window.__avisoyaInstall) setModo("ios");

    return () => {
      window.removeEventListener("beforeinstallprompt", alPoder);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (!modo) return null;

  async function instalar() {
    if (modo === "ios") return setAyuda((v) => !v);
    const e = window.__avisoyaInstall;
    if (!e) return setModo(null);
    await e.prompt();
    await e.userChoice;
    // El evento sirve una sola vez; si lo rechazó, Chrome lo vuelve a ofrecer más adelante.
    window.__avisoyaInstall = null;
    setModo(null);
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={instalar}
        aria-expanded={modo === "ios" ? ayuda : undefined}
        className="btn btn-secondary btn-sm gap-1.5 border-brand-200 text-brand-700 hover:border-brand-300"
      >
        <DescargaIcon />
        <span>Instalar</span>
      </button>

      {modo === "ios" && ayuda && (
        <div
          role="dialog"
          aria-label="Cómo instalar en iPhone"
          // En el teléfono ocupa el ancho de la pantalla; anclado al botón se salía por la izquierda.
          className="card animate-rise fixed inset-x-4 top-16 z-50 p-3.5 text-[12.5px] leading-snug text-body sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64"
        >
          <p className="font-semibold text-ink">Instálala en tu iPhone</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4">
            <li>
              Toca <b>Compartir</b> <CompartirIcon /> en la barra de Safari.
            </li>
            <li>
              Elige <b>Agregar a pantalla de inicio</b>.
            </li>
            <li>Ábrela desde el ícono para recibir notificaciones.</li>
          </ol>
          <button onClick={() => setAyuda(false)} className="btn btn-ghost btn-sm mt-2 w-full">
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}

function DescargaIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

function CompartirIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5" aria-hidden>
      <path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
