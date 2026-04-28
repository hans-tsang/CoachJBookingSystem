export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Auth gating happens per-page (login page is public; dashboard calls requireAdmin()).
  return <>{children}</>;
}
