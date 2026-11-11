import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import TravelConnectSignin, { type AuthMode } from "@/components/ui/travel-connect-signin-1";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
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

  const switchMode = (next: AuthMode) => {
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
    <div className="relative">
      <div className="absolute left-5 top-5 z-20 md:left-8 md:top-7">
        <Link href="/" className="auth-back"><ArrowLeft size={15} /> Voltar para a página inicial</Link>
      </div>
      <TravelConnectSignin
        mode={mode}
        onModeChange={switchMode}
        name={name}
        onNameChange={setName}
        email={email}
        onEmailChange={setEmail}
        password={password}
        onPasswordChange={setPassword}
        error={error}
        pending={pending}
        onSubmit={submit}
      />
    </div>
  );
}
