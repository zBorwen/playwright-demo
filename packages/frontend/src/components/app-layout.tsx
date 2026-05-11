import { SidebarNav } from '@/components/sidebar-nav';
import { Breadcrumb, useBreadcrumb } from '@/components/breadcrumb';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const breadcrumbItems = useBreadcrumb();

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar - fixed width */}
      <aside className="w-56 shrink-0 border-r border-zinc-800">
        <SidebarNav />
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-12 items-center border-b border-zinc-800 px-6">
          <Breadcrumb items={breadcrumbItems} />
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
