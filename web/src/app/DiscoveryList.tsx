"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";

export interface Competition {
  id: string;
  name: string;
  registration_closes_at: string | null;
  organizer_id: string;
  organizer: { display_name: string | null } | { display_name: string | null }[] | null;
}

type Status = "open" | "closed" | "pending";

function competitionStatus(registrationClosesAt: string | null): Status {
  if (!registrationClosesAt) return "pending";
  return new Date(registrationClosesAt) > new Date() ? "open" : "closed";
}

const STATUS_META: Record<Status, { label: string; className: string }> = {
  open: { label: "報名中", className: "border-ok/35 bg-ok/8 text-ok" },
  closed: { label: "報名已截止", className: "border-panel-border text-ink-dim" },
  pending: { label: "籌備中", className: "border-accent/35 bg-accent/8 text-accent" },
};

const FILTERS: Array<{ key: "all" | Status; label: string }> = [
  { key: "all", label: "全部" },
  { key: "open", label: "報名中" },
  { key: "closed", label: "已截止" },
  { key: "pending", label: "籌備中" },
];

function organizerName(organizer: Competition["organizer"]): string {
  const profile = Array.isArray(organizer) ? organizer[0] : organizer;
  return profile?.display_name || "未命名主辦方";
}

export function DiscoveryList({ competitions }: { competitions: Competition[] }) {
  const [filter, setFilter] = useState<"all" | Status>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return competitions;
    return competitions.filter((c) => competitionStatus(c.registration_closes_at) === filter);
  }, [competitions, filter]);

  return (
    <div>
      <SiteHeader authed={false} />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · Discovery（不需登入）</div>
          <h1 className="font-display text-[30px]">探索比賽</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            這裡列出全站主辦方建立的所有比賽。開放公開展示的作品可以直接試聽，不用登入。
          </p>
        </div>

        <div className="mb-5.5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3.5 py-1.75 text-[12.5px] transition-colors ${
                filter === f.key
                  ? "border-accent/40 bg-accent/16 text-ink"
                  : "border-panel-border bg-white/[0.04] text-ink-dim hover:bg-white/[0.08] hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={competitions.length === 0 ? "還沒有公開的比賽" : "沒有符合條件的比賽"}
            sub={competitions.length === 0 ? "等主辦方建立比賽後就會出現在這裡" : "試試看調整篩選條件"}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {filtered.map((c) => {
              const status = competitionStatus(c.registration_closes_at);
              const meta = STATUS_META[status];
              return (
                <div key={c.id} className="glass p-4.5">
                  <div className="mb-2.5 flex items-start justify-between">
                    <span className={`rounded-full border px-2.25 py-0.75 text-[11px] ${meta.className}`}>{meta.label}</span>
                  </div>
                  <div className="mb-1 text-[15.5px]">{c.name}</div>
                  <div className="mb-3 text-[12px] text-ink-faint">
                    由{" "}
                    <Link href={`/u/${c.organizer_id}`} className="text-ink-dim hover:text-accent hover:underline">
                      {organizerName(c.organizer)}
                    </Link>{" "}
                    主辦
                  </div>
                  <Link
                    href={`/register?competition=${c.id}`}
                    className="text-[12px] font-semibold text-accent hover:underline"
                  >
                    查看並報名 →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
