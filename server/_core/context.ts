import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../db";
import { readSessionToken, verifySession } from "./session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const token = readSessionToken(opts.req);
    if (token) {
      const payload = await verifySession(token);
      if (payload) user = (await getUserById(payload.userId)) ?? null;
    }
  } catch (error) {
    // Autenticacao e opcional para procedures publicas.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
