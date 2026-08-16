import { initials } from "@/lib/avatar";

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}

export function Avatar({ name, avatarUrl, size = 40 }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} style={style} className="flex-none rounded-full object-cover" />;
  }
  return (
    <div
      style={style}
      className="flex flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#ff9457] via-accent to-accent-2 font-semibold text-[#1a0e08]"
    >
      {initials(name)}
    </div>
  );
}
