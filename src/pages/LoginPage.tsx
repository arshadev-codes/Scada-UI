import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { ArrowRight, KeyRound, Lock, User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BootSequence, type BootLine } from '@/components/feature/BootSequence';
import { PhaseWaveCanvas } from '@/components/feature/PhaseWaveCanvas';
import { Brackets, Button, TextField, ThemeToggle, stagger, powerUp } from '@/components/ui';
import { useAppStore } from '@/store/appStore';
import { useClock } from '@/hooks/useClock';
import { clockTime } from '@/lib/format';

const BOOT_LINES: readonly BootLine[] = [
  { text: 'TTB-01 CONTROL FIRMWARE v0.1.0', tone: 'muted' },
  { text: 'INITIALISING TEST BENCH', status: 'OK' },
  { text: 'SELF-TEST · INTERLOCKS · E-STOP CHAIN', status: 'OK' },
  { text: 'PLC LINK  DVP-12SE @ MODBUS/TCP', status: 'STANDBY', tone: 'amber' },
  { text: 'POWER ANALYSER', status: 'NOT FITTED', tone: 'muted' },
  { text: 'READY', status: 'AWAITING OPERATOR', tone: 'ok' },
];

const MOCK_PASSWORD = 'admin';
const BOOT_SEEN_KEY = 'ttb01.bootSeen';

function bootSeen(): boolean {
  try {
    return sessionStorage.getItem(BOOT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const login = useAppStore((s) => s.login);
  const operator = useAppStore((s) => s.operator);
  const now = useClock();

  const [booted, setBooted] = useState(false);
  const [skipBoot, setSkipBoot] = useState(bootSeen);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState(false);
  const shake = useAnimationControls();
  const idRef = useRef<HTMLInputElement>(null);

  // Already logged in → straight in.
  useEffect(() => {
    if (operator && !granted) navigate('/test-object', { replace: true });
  }, [operator, granted, navigate]);

  const onBooted = useCallback(() => {
    setBooted(true);
    try {
      sessionStorage.setItem(BOOT_SEEN_KEY, '1');
    } catch {
      /* storage unavailable — boot just replays next time */
    }
  }, []);

  // Any key or click skips the boot animation.
  useEffect(() => {
    if (booted) return;
    const skip = () => setSkipBoot(true);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [booted]);

  useEffect(() => {
    if (booted) idRef.current?.focus();
  }, [booted]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (granted) return;
    const trimmed = id.trim();
    if (!trimmed || password !== MOCK_PASSWORD) {
      setError(!trimmed ? 'OPERATOR ID REQUIRED' : 'ACCESS DENIED · INVALID CREDENTIALS');
      if (!reduce) await shake.start({ x: [0, -12, 11, -8, 6, -3, 0], transition: { duration: 0.45 } });
      return;
    }
    setError(null);
    setGranted(true);
    setTimeout(
      () => {
        login(trimmed.toUpperCase());
        navigate('/test-object', { replace: true });
      },
      reduce ? 300 : 1500,
    );
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* Oscilloscope background */}
      <div className="absolute inset-0">
        <PhaseWaveCanvas intensity={0.85} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_70%_50%,transparent_0%,color-mix(in_oklab,var(--color-ink-900)_65%,transparent)_60%,color-mix(in_oklab,var(--color-ink-900)_96%,transparent)_100%)]" />
        <div className="absolute inset-y-0 left-0 w-[55%] bg-linear-to-r from-ink-900 via-ink-900/85 to-transparent" />
      </div>

      <ThemeToggle className="absolute left-6 top-4 z-20 bg-ink-850/70 backdrop-blur-sm" />

      {/* Scope HUD */}
      <div className="num pointer-events-none absolute right-6 top-5 flex gap-5 text-[13px] text-fg-dim">
        <span><span className="text-phase-r">CH1</span> R</span>
        <span><span className="text-phase-y">CH2</span> Y</span>
        <span><span className="text-phase-b">CH3</span> B</span>
        <span>50.00 Hz</span>
        <span>5 ms/div</span>
      </div>
      <div className="num pointer-events-none absolute bottom-5 right-6 text-[13px] text-fg-dim">
        {clockTime(now)} · LOCAL
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] grid-cols-1 items-center gap-12 px-8 py-12 lg:grid-cols-[1.1fr_440px] lg:px-14">
        {/* Identity + boot console */}
        <div className="max-w-xl">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="mb-6 flex items-center gap-3">
              <span className="num rounded-[2px] border border-accent/50 px-2 py-0.5 text-[13px] text-accent">TTB-01</span>
              <span className="label-tech text-[13px] text-fg-dim">HV Test Laboratory · Bay 2</span>
            </div>
            <h1 className="font-display text-[44px] font-bold uppercase leading-[0.95] tracking-[0.08em] text-fg xl:text-[56px]">
              Transformer
              <br />
              <span className="text-accent-grad">Test Bench</span>
            </h1>
            <p className="label-tech mt-4 text-[14px] text-fg-muted">Routine test control · No-load / Load loss</p>
          </motion.div>

          <div className="relative mt-10 border border-line bg-ink-950/70 p-4">
            <Brackets />
            <div className="label-tech mb-3 flex items-center justify-between text-[12px] text-fg-dim">
              <span>SYS / BOOT</span>
              <span className="num">TTY0</span>
            </div>
            <BootSequence lines={BOOT_LINES} onDone={onBooted} skip={skipBoot} />
            {!booted && <div className="num mt-3 text-[13px] text-fg-dim">PRESS ANY KEY TO SKIP</div>}
          </div>
        </div>

        {/* Login panel */}
        <AnimatePresence>
          {booted && (
            <motion.div variants={stagger(0.08, 0)} initial="hidden" animate="show" className="w-full">
              <motion.div animate={shake}>
                <motion.form
                  variants={powerUp}
                  onSubmit={submit}
                  noValidate
                  aria-labelledby="login-title"
                  className="edge-light relative border border-line bg-ink-850/90 backdrop-blur-sm"
                  data-active={granted ? 'true' : undefined}
                >
                  <Brackets color={error ? 'border-fault' : granted ? 'border-ok' : 'border-accent'} size={14} />
                  <div className="flex items-center gap-3 border-b border-line px-6 py-3">
                    <span className="num rounded-[2px] border border-line-strong px-1.5 text-[13px] text-fg-dim">AUTH-01</span>
                    <h2 id="login-title" className="label-tech text-fg">
                      Operator Sign-in
                    </h2>
                    <Lock className="ml-auto size-3.5 text-fg-dim" aria-hidden />
                  </div>

                  <div className="space-y-5 px-6 pb-6 pt-5">
                    <motion.div variants={powerUp}>
                      <TextField
                        ref={idRef}
                        label="Operator ID"
                        value={id}
                        onChange={(e) => {
                          setId(e.target.value);
                          setError(null);
                        }}
                        autoComplete="username"
                        spellCheck={false}
                        mono
                        className="uppercase"
                        placeholder="e.g. OP-0142"
                        leading={<User className="size-4" aria-hidden />}
                        disabled={granted}
                      />
                    </motion.div>
                    <motion.div variants={powerUp}>
                      <TextField
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                        autoComplete="current-password"
                        mono
                        placeholder="••••••"
                        leading={<KeyRound className="size-4" aria-hidden />}
                        disabled={granted}
                      />
                    </motion.div>

                    <div className="min-h-5" aria-live="assertive">
                      <AnimatePresence mode="wait">
                        {error && (
                          <motion.div
                            key={error}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0.4, 1] }}
                            exit={{ opacity: 0 }}
                            className="num hatch-red flex items-center gap-2 border-l-2 border-fault px-2.5 py-1.5 text-[13px] text-fault"
                          >
                            {error}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <motion.div variants={powerUp}>
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        magnetic
                        className="w-full"
                        disabled={granted}
                        icon={<ArrowRight className="size-4" aria-hidden />}
                      >
                        {granted ? 'Verifying' : 'Log in'}
                      </Button>
                    </motion.div>

                    <p className="num text-center text-[13px] text-fg-dim">
                      MOCK AUTH · any ID · password <span className="text-fg-muted">admin</span>
                    </p>
                  </div>
                </motion.form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>{granted && <AccessGranted operatorId={id.trim().toUpperCase()} />}</AnimatePresence>
    </div>
  );
}

function AccessGranted({ operatorId }: { operatorId: string }) {
  return (
    <motion.div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* horizontal bar that expands out from centre */}
      <motion.div
        className="absolute inset-x-0 top-1/2 h-px bg-ok"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className="relative text-center"
        initial={{ opacity: 0, scaleY: 0.2 }}
        animate={{ opacity: [0, 1, 0.3, 1], scaleY: 1 }}
        transition={{ delay: 0.3, duration: 0.45 }}
      >
        <div className="num mb-3 text-[14px] tracking-[0.3em] text-ok">AUTH OK · {operatorId}</div>
        <div className="bg-ink-950 px-6 font-display text-5xl font-bold uppercase tracking-[0.3em] text-fg">
          Access <span className="text-ok">Granted</span>
        </div>
        <motion.div
          className="num mt-4 text-[13px] text-fg-dim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
        >
          ESTABLISHING PLC LINK…
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
