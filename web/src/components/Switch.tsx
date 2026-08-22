interface SwitchProps {
  on: boolean;
  onClick: () => void;
  label: string;
}

// SA-009 資安複查發現:原本是沒有 accessible name/role/state 的裸 <button>,
// 螢幕報讀器只會唸出一個沒有名字的按鈕。補上 role="switch" + aria-checked +
// 必填的 label(轉成 aria-label),呼叫端一定要交代這個開關是什麼意思。
export function Switch({ on, onClick, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-6 w-10 flex-none rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        on ? "border-transparent bg-gradient-to-r from-[#ff9457] via-accent to-accent-2" : "border-panel-border bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`}
      />
    </button>
  );
}
