"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      className="grid shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white shadow-sm"
    >
      A
    </span>
  );
}

/** Barra superior fija, igual para estudiante y admin. */
export default function TopBar({
  title,
  subtitle,
  actionLabel,
  onAction,
  extra,
}: {
  title: string;
  subtitle?: string;
  actionLabel: string;
  onAction: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-2.5 lg:max-w-5xl">
        <Link href="/" aria-label="AvisoYa, inicio" className="flex shrink-0 items-center gap-2 rounded-lg transition hover:opacity-80">
          <Logo />
          {/* En el teléfono el ícono basta; el espacio es para el nombre del usuario. */}
          <span className="hidden text-[15px] font-semibold tracking-tight text-ink sm:inline">AvisoYa</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          {extra}
          <div className="min-w-0 text-right">
            <p className="truncate text-[13px] font-semibold leading-tight text-ink">{title}</p>
            {subtitle && <p className="truncate text-[11px] leading-tight text-faint">{subtitle}</p>}
          </div>
          <button onClick={onAction} className="btn btn-ghost btn-sm shrink-0">
            {actionLabel}
          </button>
        </div>
      </div>
    </header>
  );
}

/** Pestañas en control segmentado. */
export function Tabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="seg">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className="seg-btn" data-active={path === t.href}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
