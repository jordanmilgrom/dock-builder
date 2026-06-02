import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession } from "./auth.js";

/** Current signed-in (or anonymous) session, or null if none. */
export function getSession(): { customerId: string; email: string } | null {
  const value = cookies().get(SESSION_COOKIE)?.value;
  return readSession(value);
}
