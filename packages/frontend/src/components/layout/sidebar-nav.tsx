import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  Video,
  ChevronDown,
  ChevronRight,
  PlayCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchProjects, type Project } from '@/lib/api';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  badge?: number;
}

const MAIN_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: '仪表盘', href: '/' },
  { icon: FolderOpen, label: '项目', href: '/projects' },
  { icon: Video, label: '录制', href: '/recordings' },
];

export function SidebarNav() {
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState(false);
  const recordingReplays = useRecordingReplayStore(s => s.recordingReplays);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  const activeProjects = projects.slice(0, 5);

  return (
    <nav className="flex h-full flex-col bg-zinc-950" aria-label="主导航">
      {/* Logo */}
      <div className="flex h-12 items-center border-b border-zinc-800 px-4">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <PlayCircle className="h-5 w-5 text-violet-500" />
          <span>Playwright 平台</span>
        </Link>
      </div>

      {/* Main nav items */}
      <div className="flex-1 space-y-0.5 p-2">
        {MAIN_NAV.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-violet-500/10 text-violet-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {/* Projects expandable */}
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            活跃项目
          </button>
          {expanded && (
            <div className="ml-4 space-y-0.5 border-l border-zinc-800 pl-4">
              {activeProjects.map((p) => {
                const isRunning = Object.values(recordingReplays).some(
                  r => r.projectId === p.id && r.status === 'running',
                );
                return (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className={`block cursor-pointer truncate rounded-md px-3 py-1.5 text-sm transition-colors ${
                      location.pathname === `/projects/${p.id}`
                        ? 'bg-violet-500/10 text-violet-400'
                        : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
                      {p.name}
                    </span>
                  </Link>
                );
              })}
              {projects.length > 5 && (
                <Link
                  to="/projects"
                  className="block cursor-pointer truncate rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                >
                  查看全部 ({projects.length})
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
