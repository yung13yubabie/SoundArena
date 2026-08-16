import { Icon, type IconName } from "@/lib/icons";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  sub: string;
}

export function EmptyState({ icon, title, sub }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-panel-border bg-white/[0.015] px-5 py-8.5 text-center text-ink-faint">
      <Icon name={icon} size={26} className="opacity-50" />
      <div className="text-[12.5px] text-ink-dim">{title}</div>
      <div className="text-[11.5px]">{sub}</div>
    </div>
  );
}
