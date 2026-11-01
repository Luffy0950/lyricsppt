"use client";
import { FolderOpen, LayoutGrid, Menu, Palette, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/create", label: "Create presentation", icon: Plus },
  { href: "/projects", label: "My projects", icon: FolderOpen },
  { href: "/templates", label: "Templates", icon: Palette },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#201C3B" />
        <path d="M24 10h16l14 40H10z" fill="#F4B942" opacity=".22" />
        <rect x="22" y="8" width="20" height="7" rx="2" fill="#F4B942" />
        <rect x="14" y="40" width="36" height="4" rx="2" fill="#F1ECE2" />
        <rect x="20" y="48" width="24" height="4" rx="2" fill="#F1ECE2" opacity=".7" />
      </svg>
      {!compact && (
        <span className="font-display text-[15px] font-bold leading-tight tracking-tight">
          Lyrics to
          <br />
          PowerPoint
        </span>
      )}
    </span>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const editor = path.startsWith("/editor");
  useEffect(() => setOpen(false), [path]);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar; collapses to an icon rail inside the editor */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-rail/70 bg-stage/80 py-5 md:flex ${
          editor ? "w-[68px] items-center px-2" : "w-60 px-4"
        }`}
      >
        <Link href="/" className="mb-8 px-1" aria-label="Dashboard">
          <Logo compact={editor} />
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={editor ? label : undefined}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(href) ? "bg-rail text-house" : "text-house/65 hover:bg-white/5 hover:text-house"
              }`}
            >
              <Icon size={18} className={isActive(href) ? "text-spot" : ""} />
              {!editor && label}
            </Link>
          ))}
        </nav>
        {!editor && (
          <p className="mt-auto px-3 text-xs leading-relaxed text-haze/70">
            Use lyrics you own or have permission to project.
          </p>
        )}
      </aside>

      {/* mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-rail/70 bg-stage/95 px-4 backdrop-blur md:hidden">
        <Link href="/" aria-label="Dashboard">
          <Logo />
        </Link>
        <button className="btn-quiet" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav className="fixed inset-x-0 top-14 z-40 flex flex-col gap-1 border-b border-rail bg-stage p-3 md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isActive(href) ? "bg-rail" : "text-house/75"}`}
            >
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
      )}

      <main className="min-w-0 flex-1 pt-14 md:pt-0">{children}</main>
    </div>
  );
}
