import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/auth/login", // Arahkan ke sini jika user belum login
  },
});

export const config = {
  // Daftarkan rute-rute yang wajib login di sini
  matcher: [
    "/participant/:path*",
    "/psychologist/:path*",
    "/admin/:path*",
  ],
};