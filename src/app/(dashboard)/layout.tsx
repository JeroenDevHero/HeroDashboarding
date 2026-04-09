import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-hero-blue-hairline p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
