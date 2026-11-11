import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import { hashPassword, readSessionToken, signSession, verifyPassword, verifySession } from "./_core/session";
import { COOKIE_NAME } from "../shared/const";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("sessao local do AGROLINK", () => {
  it("usa um cookie de sessao dedicado ao AGROLINK", () => {
    expect(COOKIE_NAME).toBe("agrolink_session");
  });

  it("mantem o cookie seguro apenas quando a requisicao e https", () => {
    const http = getSessionCookieOptions({ protocol: "http", headers: {} } as never);
    expect(http).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax", path: "/" });

    const https = getSessionCookieOptions({ protocol: "https", headers: {} } as never);
    expect(https).toMatchObject({ secure: true, httpOnly: true, sameSite: "none", path: "/" });
  });

  it("respeita o protocolo original quando a aplicacao roda atras de um proxy", () => {
    const forwarded = getSessionCookieOptions({
      protocol: "http",
      headers: { "x-forwarded-proto": "https, http" },
    } as never);
    expect(forwarded).toMatchObject({ secure: true, sameSite: "none" });
  });

  it("gera hashes de senha que so validam a senha correta", () => {
    const stored = hashPassword("senha-secreta-123");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("senha-secreta-123");
    expect(verifyPassword("senha-secreta-123", stored)).toBe(true);
    expect(verifyPassword("senha-errada", stored)).toBe(false);
    expect(verifyPassword("senha-secreta-123", null)).toBe(false);
    expect(verifyPassword("senha-secreta-123", "formato-invalido")).toBe(false);
  });

  it("assina e valida a sessao com o segredo configurado", async () => {
    vi.stubEnv("SESSION_SECRET", "segredo-de-teste-suficientemente-longo");
    const token = await signSession({ userId: 7, email: "contato@agrolink.com.br", name: "Contato" });
    expect(await verifySession(token)).toMatchObject({ userId: 7, email: "contato@agrolink.com.br", name: "Contato" });

    vi.stubEnv("SESSION_SECRET", "outro-segredo-de-teste-bem-diferente");
    expect(await verifySession(token)).toBeNull();
  });

  it("recusa token invalido ou expirado sem lancar erro", async () => {
    vi.stubEnv("SESSION_SECRET", "segredo-de-teste-suficientemente-longo");
    expect(await verifySession("token.invalido")).toBeNull();
  });

  it("le o token do cabecalho Authorization ou do cookie de sessao", () => {
    const fromHeader = readSessionToken({ headers: { authorization: "Bearer abc123" } } as never);
    expect(fromHeader).toBe("abc123");

    const fromCookie = readSessionToken({ headers: { cookie: `outro=1; ${COOKIE_NAME}=xyz789` } } as never);
    expect(fromCookie).toBe("xyz789");

    expect(readSessionToken({ headers: {} } as never)).toBeNull();
  });
});
