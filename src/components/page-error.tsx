"use client";
import Link from "next/link";
export function PageError({ retry }: { retry: () => void }) { return <main style={{padding:32,maxWidth:800,margin:"auto"}}><h1 className="text-2xl font-semibold">Halaman belum dapat dimuat.</h1><p className="my-4">Silakan coba lagi. Data yang sudah tersimpan tidak diubah.</p><button className="rounded-lg bg-[#227b55] px-5 py-3 text-white" onClick={retry}>Coba lagi</button><Link className="ml-5 underline" href="/help">Bantuan</Link></main>; }
