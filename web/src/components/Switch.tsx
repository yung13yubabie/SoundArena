interface SwitchProps {
  on: boolean;
  onClick: () => void;
}

export function Switch({ on, onClick }: SwitchProps) {
  return (
    <button
      onClick={onClick}
      className={`relative h-5 w-9 flex-none rounded-full border transition-colors ${
        on ? "border-transparent bg-gradient-to-r from-[#ff9457] via-accent to-accent-2" : "border-panel-border bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`}
      />
    </button>
  );
}
