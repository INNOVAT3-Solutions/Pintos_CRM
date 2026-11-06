import { jwtVerify, SignJWT } from "jose";

/**
 * Signed session cookie. Kept dependency-light (jose only) because middleware
 * imports it too. The database check that the person is still active happens
 * in getCurrentUser(), so deactivating someone takes effect on their next page load.
 */
export const SESSION_COOKIE = "pintos_session";
export const SESSION_DAYS = 14;

export interface SessionClaims {
  sub: string; // staff id
  role: "admin" | "staff";
}

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || (payload.role !== "admin" && payload.role !== "staff")) return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
