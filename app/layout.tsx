import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "HYROX Bookings",
  description: "Weekly Saturday HYROX training booking — Coach J",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
