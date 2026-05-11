import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const ROUTE_LABELS: Record<string, BreadcrumbItem[]> = {
  '/': [{ label: '仪表盘', href: '/' }],
  '/projects': [{ label: '仪表盘', href: '/' }, { label: '项目', href: '/projects' }],
  '/recordings': [{ label: '仪表盘', href: '/' }, { label: '录制', href: '/recordings' }],
  '/executions': [{ label: '仪表盘', href: '/' }, { label: '执行', href: '/executions' }],
};

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-zinc-500" aria-label="面包屑导航">
      <Link to="/" className="flex items-center gap-1 hover:text-zinc-300 transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-zinc-700" />
          {item.href ? (
            <Link to={item.href} className="hover:text-zinc-300 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-zinc-300">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

export function useBreadcrumb(): BreadcrumbItem[] {
  const location = useLocation();
  const pathname = location.pathname;

  // Deep page routes
  if (pathname.startsWith('/projects/') && pathname.includes('/recordings/')) {
    return [
      { label: '项目', href: '/projects' },
      { label: '录制详情' },
    ];
  }
  if (pathname.startsWith('/projects/')) {
    return [{ label: '项目', href: '/projects' }, { label: '项目详情' }];
  }
  if (pathname.startsWith('/recordings/')) {
    return [{ label: '录制', href: '/recordings' }, { label: '录制详情' }];
  }
  if (pathname.startsWith('/executions/')) {
    return [{ label: '执行', href: '/executions' }, { label: '执行详情' }];
  }

  return ROUTE_LABELS[pathname] ?? [{ label: pathname.slice(1) || '首页' }];
}
