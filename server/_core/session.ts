import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./env";

const SCRYPT_KEY_LENGTH = 64;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias
export const SESSION_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;

export type SessionPayload = {
  userId: number;
  email: string;
  name: string | null;
};

// -----------------------------------------------------------------------------
// Senhas
// -----------------------------------------------------------------------------

/** Gera um hash no formato `scrypt$<salt>$<hash>` (salt e hash em hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

/** Compara a senha informada com o hash armazenado em tempo constante. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEY_LENGTH) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

// -----------------------------------------------------------------------------
// Sessao (JWT HS256 assinado com SESSION_SECRET)
// -----------------------------------------------------------------------------

function secretKey(): Uint8Array {
  const secret = ENV.sessionSecret;
  if (!secret) {
    throw new Error("SESSION_SECRET nao configurado: defina a variavel de ambiente antes de iniciar o servidor.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    name: payload.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const userId = Number(payload.userId);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return {
      userId,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Leitura do token na requisicao
// -----------------------------------------------------------------------------

export function readSessionToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }

  const cookies = req.headers.cookie;
  if (typeof cookies === "string") {
    for (const part of cookies.split(";")) {
      const separator = part.indexOf("=");
      if (separator === -1) continue;
      const name = part.slice(0, separator).trim();
      if (name !== COOKIE_NAME) continue;
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      if (value) return value;
    }
  }

  return null;
}

/** Identificador unico e opaco para o campo `openId` dos usuarios locais. */
export function createLocalOpenId(): string {
  return `local:${randomUUID()}`.slice(0, 64);
}
