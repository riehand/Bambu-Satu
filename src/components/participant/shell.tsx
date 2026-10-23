"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { Brand } from "./icons";

export function ParticipantShell({ fullName, userType, children }: { fullName: string; userType: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const menuButton = menu.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "Tab") {
        const items = sidebar.current?.querySelectorAll<HTMLElement>("a[href],button:not(:disabled)");
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const media = window.matchMedia("(min-width: 801px)");
    const onResize = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", onResize);
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); media.removeEventListener("change", onResize); menuButton?.focus(); };
  }, [open]);
  const links = [{ href: "/participant/dashboard", label: "Ringkasan" }, { href: "/participant/assessment", label: "Asesmen" }, { href: "/participant/history", label: "Riwayat" }];
  const active = pathname.endsWith("/results") ? "Riwayat" : links.find(l => pathname.startsWith(l.href))?.label ?? "Ringkasan";
  const focused = /^\/participant\/assessment\/[^/]+$/.test(pathname);
  if (focused) return <div className="wb-app">{children}</div>;
  return <div className="wb-app wb-shell">
    <a className="wb-skip" href="#main-content">Lewati ke konten</a>
    <aside ref={sidebar} className={`wb-sidebar ${open ? "is-open" : ""}`} aria-label="Navigasi peserta">
      <button className="wb-menu wb-button secondary" onClick={() => setOpen(false)} aria-label="Tutup menu">Tutup ×</button>
      <Link href="/participant/dashboard" onClick={() => setOpen(false)}><Brand /></Link>
      <p className="wb-nav-label">KESEJAHTERAAN KAMPUS</p>
      <nav>{links.map(link => <Link key={link.href} href={link.href} aria-current={active === link.label ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}
        {["Psikolog", "Pendamping AI", "Persetujuan & privasi"].map(label => <span className="wb-nav-disabled" key={label} aria-disabled="true">{label}<small>Segera</small></span>)}
      </nav>
      <p className="wb-sidebar-note">Ruang untuk merawat diri.<br/><br/>Untuk mahasiswa dan dosen<br/>Telkom University.</p>
      <LogoutButton />
    </aside>
    {open && <button className="wb-backdrop" aria-label="Tutup navigasi" onClick={() => setOpen(false)} />}
    <div className="wb-main-wrap" inert={open}>
      <header className="wb-header"><button ref={menu} className="wb-menu wb-button secondary" aria-expanded={open} aria-label="Buka navigasi" onClick={() => setOpen(!open)}>☰</button><p>Ruang wellbeing Anda <span>/</span> <strong>{active}</strong></p><div className="wb-profile"><strong>{fullName}</strong><small>{userType === "STUDENT" ? "Mahasiswa" : userType === "LECTURER" ? "Dosen" : "Peserta"} · Telkom University</small></div></header>
      <main id="main-content" className="wb-main">{children}</main>
    </div>
  </div>;
}
