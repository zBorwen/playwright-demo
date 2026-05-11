export type TabKey = 'timeline' | 'codegen' | 'network' | 'json' | 'executions';

interface TabBarProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  counts?: { timeline?: number; executions?: number };
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'timeline', label: '操作' },
  { key: 'codegen', label: '代码' },
  { key: 'network', label: '网络' },
  { key: 'json', label: 'JSON' },
  { key: 'executions', label: '执行' },
];

export function TabBar({ activeTab, onChange, counts }: TabBarProps) {
  return (
    <div className="mb-4 flex items-center gap-1 border-b border-zinc-800 pb-0">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const count = tab.key === 'timeline' ? counts?.timeline : tab.key === 'executions' ? counts?.executions : undefined;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {count !== undefined && (
              <span className={`ml-1 text-[10px] ${isActive ? 'text-zinc-500' : 'text-zinc-600'}`}>
                ({count})
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-zinc-100" />
            )}
          </button>
        );
      })}
    </div>
  );
}
