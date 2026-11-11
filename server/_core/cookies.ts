import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

export function getSessionCookieOptions(req: Request): CookieOptions {
  // Atras de um proxy (Render/Vercel/hosting) o protocolo original chega em
  // X-Forwarded-Proto; sem isso o Express trataria toda requisicao como http.
  const forwarded = req.headers["x-forwarded-proto"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const proto = raw?.split(",")[0]?.trim().toLowerCase();
  const isHttps = proto ? proto === "https" : req.secure || req.protocol === "https";
  const secure = isHttps || ENV.cookieSecure;

  // `SameSite=None` so e aceito com `Secure`; sem HTTPS mantemos `Lax`, que
  // funciona em http://localhost e continua bloqueando o envio entre sites.
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
