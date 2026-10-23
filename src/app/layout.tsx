import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter", 
});

export const metadata: Metadata = {
  title: "WellBeing Hub | Telkom University",
  description: "Mental well-being assessment platform for students and lecturers at Telkom University.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${inter.variable} font-sans bg-brand-mint text-gray-900 antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}