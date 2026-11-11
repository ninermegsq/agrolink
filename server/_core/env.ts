// Valores lidos no momento do uso (nunca no import), para que o processo
// possa carregar o `.env` e o ambiente de execucao sem reiniciar o modulo.
export const ENV = {
  get appId() { return process.env.APP_ID ?? ""; },
  // Chave usada para assinar os tokens de sessao (HS256).
  get sessionSecret() { return process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get appUrl() { return process.env.APP_URL ?? ""; },
  // Identificador do usuario dono da plataforma (opcional).
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  // `secure: true` exige HTTPS. Em desenvolvimento local (http://localhost)
  // o navegador descartaria o cookie e o login nunca funcionaria, por isso o
  // padrao depende do ambiente e pode ser forcado por COOKIE_SECURE.
  get cookieSecure() {
    const flag = (process.env.COOKIE_SECURE ?? "").trim().toLowerCase();
    if (flag === "true") return true;
    if (flag === "false") return false;
    return process.env.NODE_ENV === "production";
  },
  // E-mails (separados por virgula) que recebem perfil de administrador.
  get adminEmails() {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
  },
};
