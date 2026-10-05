import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "AvisoYa",
  description: "Tu horario y los cambios de última hora, al instante.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "AvisoYa", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0369a1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        {children}
        {/* Chrome avisa que la app se puede instalar muy temprano, a veces antes de que
            React monte el botón. Se guarda el evento para que el botón lo encuentre. */}
        <Script id="captura-instalacion" strategy="beforeInteractive">
          {`window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__avisoyaInstall=e;});`}
        </Script>
      </body>
    </html>
  );
}
