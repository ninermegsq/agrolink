export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const LOGIN_PATH = "/login";

/**
 * Abre a tela de login do AGROLINK.
 *
 * O acesso usa login local (e-mail e senha) com cookie de sessão, portanto
 * nao existe portal externo de autorizacao. A navegacao acontece no momento
 * da chamada — nunca durante o render (nao use `href={startLogin()}`).
 */
export const startLogin = () => {
  if (typeof window === "undefined") return;
  if (window.location.pathname === LOGIN_PATH) return;
  window.location.assign(LOGIN_PATH);
};
