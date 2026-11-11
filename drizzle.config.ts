import { defineConfig } from "drizzle-kit";

// O drizzle-kit usa a variavel DATABASE_URL. O valor padrao permite rodar
// `pnpm db:generate` (que so le o schema) mesmo sem um banco configurado;
// `pnpm db:migrate` exige a DATABASE_URL real (Supabase).
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/agrolink";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
