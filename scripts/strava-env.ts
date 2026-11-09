import { config } from "dotenv";
import type { AthleteSlug } from "../src/lib/training/types";

/**
 * Load `.env.local` (then `.env`) before anything reads process.env. Imported
 * first by every strava-* script. Scripts run with
 * `tsx --conditions=react-server` so the `server-only` marker in db.ts is
 * inert outside Next.
 */
config({ path: ".env.local" });
config();

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env.local (see docs/TRAINING-LOG.md).`);
    process.exit(1);
  }
  return value;
}

/** The only athlete the site tracks. */
export const ATHLETE: AthleteSlug = "filippo";

/**
 * `--athlete` is optional and defaults to filippo, the only athlete the site
 * tracks; anything else is refused.
 */
export function parseAthlete(value: string | undefined): AthleteSlug {
  if (value === undefined || value === "" || value === ATHLETE) return ATHLETE;
  console.error(`Only ${ATHLETE} is tracked; drop --athlete or pass --athlete ${ATHLETE}.`);
  process.exit(1);
}
