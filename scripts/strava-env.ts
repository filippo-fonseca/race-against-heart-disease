import { config } from "dotenv";

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

export function parseAthlete(value: string | undefined): "filippo" | "amir" {
  if (value === "filippo" || value === "amir") return value;
  console.error("Pass --athlete filippo or --athlete amir.");
  process.exit(1);
}
