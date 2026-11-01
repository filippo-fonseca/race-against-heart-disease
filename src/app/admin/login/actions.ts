"use server";

import { redirect } from "next/navigation";
import { checkPassword, clearLoginAttempts, clientIp, loginAllowed, recordFailedLogin, startSession } from "@/lib/admin/auth";

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = await clientIp();
  if (!loginAllowed(ip)) {
    return { error: "Too many attempts. Try again in fifteen minutes." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !checkPassword(password)) {
    recordFailedLogin(ip);
    return { error: "That password is not right." };
  }

  clearLoginAttempts(ip);
  if (!(await startSession())) {
    return { error: "ADMIN_SESSION_SECRET is not configured on the server." };
  }
  redirect("/admin");
}
