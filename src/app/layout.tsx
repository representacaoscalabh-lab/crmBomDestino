import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Bom Destino",
  description: "Gestão comercial Bom Destino Laticínios de Búfala",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <StoreProvider>
            <AuthGate><AppShell>{children}</AppShell></AuthGate>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
