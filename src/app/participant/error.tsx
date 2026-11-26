"use client";
export default function ParticipantError({ retry }: { retry: () => void }) {
  return <div className="wb-app wb-loading"><h1>Halaman belum dapat dimuat.</h1><p>Silakan coba lagi. Jawaban yang sudah tersimpan tetap berada di akun Anda.</p><button className="wb-button" onClick={retry}>Coba lagi</button></div>;
}
