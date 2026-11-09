import { logout } from "@/app/admin/actions";
import { Mark } from "@/components/marks";
import { site } from "@/lib/site";

/** Title and the log-out button. */
export function AdminHeader() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="flex items-center gap-3 font-serif text-[2.2rem] leading-none tracking-tight sm:text-[2.8rem]">
            <Mark className="h-8 w-8 text-red sm:h-9 sm:w-9" />
            Admin
          </h1>
          <div className="label mt-3">{site.name} · Strava activities</div>
        </div>
        <form action={logout}>
          <button type="submit" className="pill pill-ghost !h-9 !px-4 !text-[0.95rem] text-ink-soft">
            Log out
          </button>
        </form>
      </header>
      <div className="mt-6 h-px w-full bg-red" />
    </>
  );
}
