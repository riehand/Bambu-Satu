import Link from "next/link";
import { Brand } from "@/components/participant/icons";
import { LogoutButton } from "@/components/logout-button";
import "@/app/participant/participant.css";
import "./workspace-shell.css";
export function WorkspaceShell({ fullName, children }: { fullName: string; children: React.ReactNode }) {
  return <div className="wb-app professional-shell"><a href="#professional-main" className="wb-skip">Lewati ke konten</a><aside className="professional-nav"><Link href="/psychologist/dashboard"><Brand/></Link><p className="wb-nav-label">RUANG PSIKOLOG</p><nav aria-label="Navigasi psikolog"><Link href="#overview">Ringkasan</Link><Link href="#appointments">Janji & laporan bersama</Link><Link href="#availability">Ketersediaan</Link><Link href="#profile">Profil profesional</Link><Link href="/help">Bantuan</Link></nav><LogoutButton/></aside><div className="professional-body"><header className="wb-header"><p>Ruang psikolog / Dashboard</p><div className="wb-profile"><strong>{fullName}</strong><small>Psikolog</small></div></header><main id="professional-main" className="ph-main">{children}</main></div></div>;
}
