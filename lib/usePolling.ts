"use client";

import { useEffect } from "react";

/**
 * Refresca cada `ms`, pero solo con la pestaña visible, y vuelve a refrescar
 * apenas el usuario regresa. Antes se consultaba igual con la app en segundo
 * plano: gasto de datos y batería para nada.
 */
export function usePolling(cargar: () => void, ms = 15_000) {
  useEffect(() => {
    cargar();
    const visible = () => typeof document === "undefined" || !document.hidden;
    const t = setInterval(() => {
      if (visible()) cargar();
    }, ms);
    const alVolver = () => {
      if (visible()) cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar, ms]);
}
