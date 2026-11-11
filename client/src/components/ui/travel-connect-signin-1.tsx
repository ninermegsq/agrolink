import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Leaf, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Tema "sign-in" com mapa de pontos animado, adaptedo para a paleta do
 * AGROLINK (verde do campo + dourado da marca). O painel da esquerda
 * desenha a rede de conexões; o da direita concentra o acesso.
 */

export type AuthMode = "login" | "register";

export interface TravelConnectSigninProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  error?: string | null;
  pending?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

type RoutePoint = { x: number; y: number; delay: number };

// Rotas em coordenadas relativas (0..1) para acompanhar o tamanho do painel.
const ROUTES: { start: RoutePoint; end: RoutePoint }[] = [
  { start: { x: 0.30, y: 0.68, delay: 0 }, end: { x: 0.60, y: 0.36, delay: 2 } },
  { start: { x: 0.60, y: 0.36, delay: 2 }, end: { x: 0.79, y: 0.54, delay: 4 } },
  { start: { x: 0.15, y: 0.23, delay: 1 }, end: { x: 0.45, y: 0.82, delay: 3 } },
  { start: { x: 0.85, y: 0.27, delay: 0.5 }, end: { x: 0.54, y: 0.82, delay: 2.5 } },
];

function AgroBrand({ className }: { className?: string }) {
  return (
    <div className={cn("brand", className)}>
      <span className="brand-mark"><span /><span /></span>
      <span className="brand-name">AGRO<span>LINK</span></span>
    </div>
  );
}

const AgroMap = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });

    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const gap = 12;
    const dots: { x: number; y: number; opacity: number }[] = [];
    for (let x = 0; x < size.width; x += gap) {
      for (let y = 0; y < size.height; y += gap) {
        const insideMap =
          // América do Norte
          ((x < size.width * 0.25 && x > size.width * 0.05) && (y < size.height * 0.4 && y > size.height * 0.1)) ||
          // América do Sul
          ((x < size.width * 0.25 && x > size.width * 0.15) && (y < size.height * 0.8 && y > size.height * 0.4)) ||
          // Europa
          ((x < size.width * 0.45 && x > size.width * 0.3) && (y < size.height * 0.35 && y > size.height * 0.15)) ||
          // África
          ((x < size.width * 0.5 && x > size.width * 0.35) && (y < size.height * 0.65 && y > size.height * 0.35)) ||
          // Ásia
          ((x < size.width * 0.7 && x > size.width * 0.45) && (y < size.height * 0.5 && y > size.height * 0.1)) ||
          // Oceania
          ((x < size.width * 0.8 && x > size.width * 0.65) && (y < size.height * 0.8 && y > size.height * 0.6));

        if (insideMap && Math.random() > 0.3) {
          dots.push({ x, y, opacity: Math.random() * 0.45 + 0.18 });
        }
      }
    }

    let frame = 0;
    let startedAt = Date.now();

    const draw = () => {
      ctx.clearRect(0, 0, size.width, size.height);

      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(31, 122, 87, ${dot.opacity})`;
        ctx.fill();
      }

      const elapsed = (Date.now() - startedAt) / 1000;

      for (const route of ROUTES) {
        const startX = route.start.x * size.width;
        const startY = route.start.y * size.height;
        const endX = route.end.x * size.width;
        const endY = route.end.y * size.height;
        const local = elapsed - route.start.delay;
        if (local <= 0) continue;

        const progress = Math.min(local / 3, 1);
        const x = startX + (endX - startX) * progress;
        const y = startY + (endY - startY) * progress;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = "rgba(31, 122, 87, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(startX, startY, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#1f7a57";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(42, 143, 103, 0.35)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#2a8f67";
        ctx.fill();

        if (progress === 1) {
          ctx.beginPath();
          ctx.arc(endX, endY, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#1f7a57";
          ctx.fill();
        }
      }

      if (elapsed > 15) startedAt = Date.now();
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
};

export default function TravelConnectSignin({
  mode,
  onModeChange,
  name,
  onNameChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  error,
  pending,
  onSubmit,
}: TravelConnectSigninProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isLogin = mode === "login";

  const fieldClass = cn(
    "h-11 rounded-lg border-[#d5ded6] bg-[#f7faf7] pl-9 text-sm text-[#1b2a22] placeholder:text-[#9aab9f]",
    "focus-visible:border-[#1f7a57] focus-visible:ring-[#1f7a57]/40",
    "dark:border-[#30473a] dark:bg-[#16231b] dark:text-[#edf5ef] dark:placeholder:text-[#6f8878]",
  );

  return (
    <div className="auth-stage">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45 }}
        className="flex w-full max-w-4xl overflow-hidden rounded-2xl border border-[#dfe7df] bg-white shadow-[0_30px_80px_-32px_rgba(12,40,24,0.38)] dark:border-[#294035] dark:bg-[#16231b]"
      >
        {/* Painel da rede */}
        <div className="relative hidden w-1/2 overflow-hidden border-r border-[#e4ede5] md:block dark:border-[#294035]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#f0f7f0] via-[#e6f1e7] to-[#d5e7d9] dark:from-[#16301f] dark:via-[#132819] dark:to-[#10221a]">
            <AgroMap />

            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8 text-center">
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mb-6"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2a8f67] to-[#0f3d2e] shadow-lg shadow-[#1f7a57]/30">
                  <Leaf className="h-7 w-7 text-white" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.5 }}
                className="mb-5"
              >
                <AgroBrand className="auth-brand" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65, duration: 0.5 }}
                className="mb-3 bg-gradient-to-r from-[#1f7a57] to-[#0f3d2e] bg-clip-text text-2xl font-bold tracking-tight text-transparent dark:from-[#7fc79a] dark:to-[#dcefe1]"
              >
                A rede do agronegócio
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75, duration: 0.5 }}
                className="max-w-xs text-sm leading-relaxed text-[#4f6b5b] dark:text-[#a5c4ad]"
              >
                Entre para organizar produtores, compradores e transportadoras da sua operação — e abrir a próxima conversa pelo WhatsApp.
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.5 }}
                className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5d7a68] dark:text-[#8fb59c]"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe0d2] bg-white/70 px-3 py-1.5 dark:border-[#2f4d39] dark:bg-[#1b2b21]/70">
                  <ShieldCheck size={12} /> Base conferida
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe0d2] bg-white/70 px-3 py-1.5 dark:border-[#2f4d39] dark:bg-[#1b2b21]/70">
                  <Leaf size={12} /> WhatsApp
                </span>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Formulário */}
        <div className="flex w-full flex-col justify-center bg-white p-8 md:w-1/2 md:p-10 dark:bg-[#16231b]">
          <div className="mb-7 md:hidden">
            <AgroBrand className="auth-brand" />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28 }}
            >
              <h1 className="text-2xl font-bold tracking-tight text-[#1b2a22] dark:text-[#edf5ef]">
                {isLogin ? "Bem-vindo de volta" : "Crie sua conta"}
              </h1>
              <p className="mt-1.5 mb-7 text-sm text-[#708077] dark:text-[#9ab0a0]">
                {isLogin
                  ? "Entre para abrir o painel da sua organização."
                  : "Organize os contatos da sua operação em poucos passos."}
              </p>

              <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-[#dfe7df] bg-[#f2f6f2] p-1 dark:border-[#294035] dark:bg-[#1b2b21]">
                {(["login", "register"] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onModeChange(value)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      mode === value
                        ? "bg-white text-[#1f7a57] shadow-sm dark:bg-[#22332a] dark:text-[#8fd0ae]"
                        : "text-[#708077] hover:text-[#1f7a57] dark:text-[#9ab0a0] dark:hover:text-[#8fd0ae]",
                    )}
                  >
                    {value === "login" ? "Entrar" : "Criar conta"}
                  </button>
                ))}
              </div>

              <form className="space-y-4" onSubmit={onSubmit} noValidate>
                {!isLogin && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[#35503f] dark:text-[#c3d6c8]">
                      Nome completo
                    </span>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ea294]" />
                      <Input
                        id="name"
                        type="text"
                        value={name}
                        onChange={event => onNameChange(event.target.value)}
                        placeholder="Como devemos chamar você"
                        autoComplete="name"
                        className={fieldClass}
                      />
                    </div>
                  </label>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#35503f] dark:text-[#c3d6c8]">
                    E-mail
                  </span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ea294]" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={event => onEmailChange(event.target.value)}
                      placeholder="voce@empresa.com.br"
                      autoComplete="email"
                      className={fieldClass}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#35503f] dark:text-[#c3d6c8]">
                    Senha
                  </span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ea294]" />
                    <Input
                      id="password"
                      type={passwordVisible ? "text" : "password"}
                      value={password}
                      onChange={event => onPasswordChange(event.target.value)}
                      placeholder={isLogin ? "Sua senha" : "Ao menos 6 caracteres"}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      className={cn(fieldClass, "pr-11")}
                    />
                    <button
                      type="button"
                      onClick={() => setPasswordVisible(value => !value)}
                      aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#8ea294] transition-colors hover:text-[#1f7a57]"
                    >
                      {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>

                {error && (
                  <p role="alert" className="rounded-lg border border-[#ecc6c6] bg-[#fdf1f1] px-3 py-2 text-xs text-[#a1443f] dark:border-[#6b3434] dark:bg-[#3a1f1f] dark:text-[#e5a8a4]">
                    {error}
                  </p>
                )}

                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onHoverStart={() => setHovered(true)}
                  onHoverEnd={() => setHovered(false)}
                  className="pt-1"
                >
                  <Button
                    type="submit"
                    disabled={pending}
                    className={cn(
                      "relative h-11 w-full overflow-hidden rounded-lg border-0 bg-gradient-to-r from-[#1f7a57] to-[#0f3d2e] text-white",
                      "hover:from-[#2a8f67] hover:to-[#134a37] focus-visible:ring-[#1f7a57]/40",
                      hovered && "shadow-lg shadow-[#1f7a57]/30",
                    )}
                  >
                    <span className="flex items-center justify-center">
                      {pending ? (
                        <>
                          <Loader2 className="animate-spin" size={16} /> Processando…
                        </>
                      ) : (
                        <>
                          {isLogin ? "Entrar" : "Criar conta e entrar"}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </span>
                    {hovered && !pending && (
                      <motion.span
                        initial={{ left: "-100%" }}
                        animate={{ left: "100%" }}
                        transition={{ duration: 1, ease: "easeInOut" }}
                        className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        style={{ filter: "blur(8px)" }}
                      />
                    )}
                  </Button>
                </motion.div>
              </form>

              <p className="mt-6 text-center text-[11px] leading-relaxed text-[#8a9a90] dark:text-[#7f9789]">
                {isLogin
                  ? "Ainda não tem conta? Crie a sua em “Criar conta” — a organização é preparada automaticamente."
                  : "Se o seu acesso foi criado por um administrador, use o mesmo e-mail para definir a senha."}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
