import type { Metadata } from "next";
import { Suspense } from "react";
import { Activities } from "@/components/admin/Activities";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Mark } from "@/components/marks";
import { SiteHeader } from "@/components/SiteHeader";
import { requireAdmin } from "@/lib/admin/auth";
import { recentActivities } from "@/lib/admin/dashboard";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/** The Strava resync action waits on the sync route, which can take a while. */
export const maxDuration = 60;

/** Shown while the session is checked and the activities load. */
function Skeleton() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div>
        <h1 className="flex items-center gap-3 font-serif text-[2.2rem] leading-none tracking-tight sm:text-[2.8rem]">
          <Mark className="h-8 w-8 text-red sm:h-9 sm:w-9" />
          Admin
        </h1>
        <div className="label mt-3">{site.name} · Admin</div>
      </div>
    </header>
  );
}

async function Dashboard() {
  await requireAdmin();
  const activities = await recentActivities(20);
  return (
    <>
      <AdminHeader />
      <Activities rows={activities.rows} error={activities.error} />
    </>
  );
}

export default function AdminPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <div className="px-4 py-6 sm:px-6 sm:py-10">
        <article className="sheet mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
          <Suspense fallback={<Skeleton />}>
            <Dashboard />
          </Suspense>
        </article>
      </div>
    </>
  );
}
