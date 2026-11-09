import "./strava-env";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { parseAthlete, requireEnv } from "./strava-env";
import { upsertAthleteRow } from "../src/lib/training/db";
import { authorizeUrl, exchangeCode, missingScopes, STRAVA_SCOPES } from "../src/lib/training/strava";

/**
 * One-time Strava authorization for Filippo, the only athlete the site tracks.
 *
 *   npm run strava:auth            (`--athlete filippo` is accepted and optional)
 *
 * Opens the consent page, catches the redirect on localhost:4567, exchanges
 * the code and upserts the athlete row (name, avatar, tokens). It asks for
 * activity:read_all and activity:write (the MCP tools create and edit
 * activities on Strava) and refuses to save unless both were granted, so an
 * authorization made before write access existed is redone once. The Strava app
 * must list `localhost` as its Authorization Callback Domain.
 */

const PORT = 4567;
const REDIRECT = `http://localhost:${PORT}/callback`;

const { values } = parseArgs({ options: { athlete: { type: "string" } } });
const slug = parseAthlete(values.athlete);
requireEnv("STRAVA_CLIENT_ID");
requireEnv("STRAVA_CLIENT_SECRET");
requireEnv("NEXT_PUBLIC_SUPABASE_URL");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // Fall through; the URL is printed either way.
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const scope = url.searchParams.get("scope") ?? "";
  try {
    if (error || !code) throw new Error(`Strava returned ${error ?? "no code"}`);
    const missing = missingScopes(scope);
    if (missing.length > 0) {
      throw new Error(
        `Strava granted "${scope || "nothing"}" but the app needs ${STRAVA_SCOPES.join(" and ")}. ` +
          `Missing: ${missing.join(", ")}. Re-run and leave every permission box ticked on the consent page.`,
      );
    }
    const data = await exchangeCode(code);
    if (!data.athlete) throw new Error("Token response had no athlete.");
    const name = `${data.athlete.firstname ?? ""} ${data.athlete.lastname ?? ""}`.trim();
    await upsertAthleteRow({
      slug,
      name: name || slug,
      strava_id: data.athlete.id,
      avatar_url: data.athlete.profile ?? null,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    });
    res
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(`<p style="font:16px system-ui">Connected ${name} as <b>${slug}</b>. You can close this tab.</p>`);
    console.log(`Saved ${slug}: ${name} (Strava id ${data.athlete.id}).`);
    finish(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "content-type": "text/plain" }).end(message);
    console.error(message);
    finish(1);
  }
});

function finish(code: number) {
  server.close();
  setTimeout(() => process.exit(code), 100);
}

server.listen(PORT, () => {
  const url = authorizeUrl(REDIRECT);
  console.log(`Authorizing ${slug}. If the browser did not open, visit:\n${url}\n`);
  openBrowser(url);
});

setTimeout(() => {
  console.error("Timed out waiting for the Strava redirect.");
  finish(1);
}, 5 * 60 * 1000).unref();
