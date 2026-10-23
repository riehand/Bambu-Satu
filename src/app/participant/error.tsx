"use client";
export default function ParticipantError({ reset }: { reset: () => void }) {
  return <div className="wb-app wb-loading"><h1>Halaman belum dapat dimuat.</h1><p>Silakan coba lagi. Jawaban yang sudah tersimpan tetap berada di akun Anda.</p><button className="wb-button" onClick={reset}>Coba lagi</button></div>;
}
