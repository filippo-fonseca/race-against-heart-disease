import type { Metadata } from "next";
import { Mark } from "@/components/marks";
import { SiteHeader } from "@/components/SiteHeader";
import { site } from "@/lib/site";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <div className="px-4 py-6 sm:px-6 sm:py-10">
        <article className="sheet mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
          <header>
            <h1 className="flex items-center gap-3 font-serif text-[2.2rem] leading-none tracking-tight sm:text-[2.8rem]">
              <Mark className="h-8 w-8 text-red sm:h-9 sm:w-9" />
              Admin
            </h1>
            <div className="label mt-3">{site.name} · Private</div>
          </header>
          <div className="mt-6 h-px w-full bg-red" />
          <LoginForm />
        </article>
      </div>
    </>
  );
}
