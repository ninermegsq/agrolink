import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

function Logo() { return <div className="brand"><span className="brand-mark"><span /><span /></span><span className="brand-name">AGRO<span>LINK</span></span></div>; }

type Mode = "login" | "register";

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();
  const pending = loginMutation.isPending || registerMutation.isPending;

  useEffect(() => {
    if (!loading && isAuthenticated) setLocation("/app");
  }, [isAuthenticated, loading, setLocation]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    if (mode === "register" && name.trim().length < 2) {
      setError("Informe seu nome completo.");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setError("A senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    try {
      const result = mode === "login"
        ? await loginMutation.mutateAsync({ email: trimmedEmail, password })
        : await registerMutation.mutateAsync({ name: name.trim(), email: trimmedEmail, password });
      utils.auth.me.setData(undefined, result.user);
      toast.success(mode === "login" ? "Acesso liberado." : "Conta criada. Bem-vindo ao AGROLINK!");
      setLocation("/app");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível concluir o acesso.";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-topbar">
        <Link href="/"><Logo /></Link>
        <Link href="/" className="login-back"><ArrowLeft size={15} /> Voltar para a página inicial</Link>
      </div>

      <main className="login-main">
        <div className="login-card">
          <div className="auth-icon"><ShieldCheck size={22} /></div>
          <h1>{mode === "login" ? "Entrar no AGROLINK" : "Criar sua conta"}</h1>
          <p>{mode === "login"
            ? "Use o e-mail e a senha da sua conta para abrir o painel da sua organização."
            : "Crie sua conta para organizar os contatos da sua operação e acessar a base liberada."}</p>

          <div className="login-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}><LogIn size={14} /> Entrar</button>
            <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}><UserPlus size={14} /> Criar conta</button>
          </div>

          <form className="login-form" onSubmit={submit} noValidate>
            {mode === "register" && (
              <label>
                <span>Nome completo</span>
                <input type="text" value={name} onChange={event => setName(event.target.value)} placeholder="Como devemos chamar você" autoComplete="name" />
              </label>
            )}
            <label>
              <span>E-mail</span>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" />
            </label>
            <label>
              <span>Senha</span>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "Ao menos 6 caracteres" : "Sua senha"} autoComplete={mode === "register" ? "new-password" : "current-password"} />
            </label>

            {error && <p className="login-error" role="alert">{error}</p>}

            <Button type="submit" disabled={pending}>
              {pending ? <><Loader2 className="spin" size={15} /> Processando…</> : mode === "login" ? "Entrar" : "Criar conta e entrar"}
            </Button>
          </form>

          <small className="login-note">Se o seu acesso foi criado por um administrador, use o mesmo e-mail para definir a senha na aba “Criar conta”.</small>
        </div>
      </main>
    </div>
  );
}
