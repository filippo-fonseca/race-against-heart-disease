import "server-only";
import { cacheLife } from "next/cache";

/**
 * Live fundraising total from Team IMF's DonorDrive page.
 * DonorDrive exposes a public JSON API per participant, so no scraping:
 *   https://ironmanfoundation.donordrive.com/api/participants/{id}
 * DONORDRIVE_PARTICIPANT_ID (Filippo's is 5303) turns it on. The goal comes
 * from DonorDrive too, so changing it there updates the site; without the id,
 * or if the API fails, the meter shows the fallback goal with zero raised.
 */

/** Fallback goal, used only when DonorDrive is unreachable or not configured. */
export const FUNDRAISING_GOAL_USD = 2050;

export interface Fundraising {
  raisedUsd: number;
  goalUsd: number;
  /** 0..n, not clamped: 1.25 means 125% of goal. */
  progress: number;
  donors: number | null;
  /** Public page to donate on, when known. */
  pageUrl: string | null;
  fetchedAt: string;
  live: boolean;
}

interface DonorDriveParticipant {
  sumDonations?: number;
  fundraisingGoal?: number;
  numDonations?: number;
  links?: { donate?: string; page?: string };
}

const DONORDRIVE_BASE = "https://ironmanfoundation.donordrive.com/api";

export async function getFundraising(): Promise<Fundraising> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });

  const id = process.env.DONORDRIVE_PARTICIPANT_ID;
  const fallback: Fundraising = {
    raisedUsd: 0,
    goalUsd: FUNDRAISING_GOAL_USD,
    progress: 0,
    donors: null,
    pageUrl: null,
    fetchedAt: new Date().toISOString(),
    live: false,
  };
  if (!id) return fallback;

  try {
    const res = await fetch(`${DONORDRIVE_BASE}/participants/${id}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return fallback;
    const p = (await res.json()) as DonorDriveParticipant;
    const raised = Number(p.sumDonations ?? 0);
    const goal = Number(p.fundraisingGoal) > 0 ? Number(p.fundraisingGoal) : FUNDRAISING_GOAL_USD;
    return {
      raisedUsd: raised,
      goalUsd: goal,
      progress: raised / goal,
      donors: typeof p.numDonations === "number" ? p.numDonations : null,
      pageUrl: p.links?.donate ?? p.links?.page ?? null,
      fetchedAt: new Date().toISOString(),
      live: true,
    };
  } catch {
    return fallback;
  }
}

export function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
