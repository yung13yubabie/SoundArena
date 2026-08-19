"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
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

export function DiscoveryList({ competitions, authed }: { competitions: Competition[]; authed: boolean }) {
  const [filter, setFilter] = useState<"all" | Status>("all");
  const reduceMotion = useReducedMotion();

  const filtered = useMemo(() => {
    if (filter === "all") return competitions;
    return competitions.filter((c) => competitionStatus(c.registration_closes_at) === filter);
  }, [competitions, filter]);

  return (
    <div>
      <SiteHeader authed={authed} active="events" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[30px]">探索比賽</h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
              看看現在有哪些比賽，公開展示的作品不用登入就能試聽。
            </p>
          </div>
          <div className="flex flex-none items-center gap-3">
            <Link href="/organizers" className="focus-ring text-[12.5px] text-ink-faint transition-colors hover:text-ink">
              看看主辦人
            </Link>
            <Link
              href="/admin/format"
              className="focus-ring rounded-[10px] border border-accent/35 bg-accent/8 px-4 py-2.25 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/14"
            >
              想主辦自己的比賽？
            </Link>
          </div>
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
            {filtered.map((c, i) => {
              const status = competitionStatus(c.registration_closes_at);
              const meta = STATUS_META[status];
              return (
                <motion.div
                  key={c.id}
                  className="glass p-4.5"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                >
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
                  <div className="flex items-center gap-3.5">
                    <Link
                      href={`/register?competition=${c.id}`}
                      className="text-[12px] font-semibold text-accent hover:underline"
                    >
                      查看並報名 →
                    </Link>
                    <Link
                      href={`/competitions?competition=${c.id}`}
                      className="text-[12px] text-ink-dim hover:text-accent hover:underline"
                    >
                      試聽作品
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
