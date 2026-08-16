export const ICONS = {
  play: "M6 4.5v15l13-7.5-13-7.5z",
  pause: "M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z",
  next: "M5 5l9 7-9 7V5zM17 5v14",
  prev: "M19 5l-9 7 9 7V5zM7 5v14",
  check: "M20 6L9 17l-5-5",
  alert: "M12 2 1 21h22L12 2zm0 7v5m0 3h.01",
  shield: "M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z",
  eyeOff:
    "M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M9.9 5.1A10.6 10.6 0 0122 12s-1.1 2.2-3.2 4.1M6.3 6.3C4 8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.6-.6",
  upload: "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3",
  externalLink: "M14 5h5v5M19 5l-9 9M8 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-2",
  chevron: "M9 6l6 6-6 6",
  inbox: "M3 12h4l2 3h6l2-3h4M5 5h14l2 7v7a1 1 0 01-1 1H4a1 1 0 01-1-1v-7l2-7z",
  crown: "M4 18h16l1-9-5 3-4-6-4 6-5-3 1 9z",
  calendar: "M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z",
  close: "M18 6L6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
