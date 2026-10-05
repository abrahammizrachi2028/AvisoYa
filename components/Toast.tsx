"use client";

import { useEffect } from "react";

// Mensaje flotante abajo al centro; se cierra solo.
export default function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [msg, onClose]);

  if (!msg) return null;
  const error = msg.startsWith("Error");
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={`animate-rise pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-xl ring-1 ${
          error ? "bg-red-600 ring-red-500/40" : "bg-ink ring-white/10"
        }`}
      >
        <span aria-hidden className="mt-0.5 shrink-0">
          {error ? <AlertIcon /> : <CheckIcon />}
        </span>
        <span className="flex-1 leading-snug">{msg.replace(/^✓\s*/, "")}</span>
        <button
          onClick={onClose}
          className="-mr-1 shrink-0 rounded p-0.5 text-white/60 transition hover:text-white"
          aria-label="Cerrar"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
