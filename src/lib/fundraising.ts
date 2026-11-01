import "server-only";

/**
 * Live fundraising total from Team IMF's DonorDrive page.
 * DonorDrive exposes a public JSON API per participant, so no scraping:
 *   https://ironmanfoundation.donordrive.com/api/participants/{id}
 * Set DONORDRIVE_PARTICIPANT_ID once registered. Until then we return the
 * goal with zero raised so the meter still renders.
 */

export const FUNDRAISING_GOAL_USD = 2100;

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
      // DonorDrive totals move slowly; ten minutes is plenty.
      next: { revalidate: 600 },
    });
    if (!res.ok) return fallback;
    const p = (await res.json()) as DonorDriveParticipant;
    const raised = Number(p.sumDonations ?? 0);
    return {
      raisedUsd: raised,
      goalUsd: FUNDRAISING_GOAL_USD,
      progress: raised / FUNDRAISING_GOAL_USD,
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
