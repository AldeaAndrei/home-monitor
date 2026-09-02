import { Geist_Mono, Nunito } from "next/font/google";
import Header from "@/app/components/Header";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Home Monitor",
  description: "Track your sensors.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${geistMono.variable} antialiased font-sans`}>
        <Header />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
