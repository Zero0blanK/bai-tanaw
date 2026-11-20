import type { Metadata } from 'next';
import { TanawMark } from '@/components/shared/brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const RULES = [
  { title: 'Authorized targets only', body: 'Every request is checked against the allowlist and the target’s scope before it leaves.' },
  { title: 'Test accounts, synthetic data', body: 'Secrets are stripped from tool output before anything is stored or sent to the AI.' },
  { title: 'People decide', body: 'Tools and AI suggest findings. Only an assessor can confirm one.' },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink-900 px-12 py-12 text-ink-300 lg:flex lg:flex-col">
        {/* Horizon lines: the view from a lookout. Decorative only. */}
        <svg aria-hidden className="absolute inset-x-0 bottom-0 h-64 w-full text-brand-500/20" viewBox="0 0 600 200" preserveAspectRatio="none">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M0 ${200 - i * 30} Q 300 ${170 - i * 34} 600 ${200 - i * 30}`} fill="none" stroke="currentColor" strokeWidth="1.5" />
          ))}
        </svg>
        <div className="flex items-center gap-3 text-white">
          <TanawMark className="h-9 w-9" />
          <span className="font-display text-2xl font-semibold tracking-tight">Tanaw</span>
        </div>
        <div className="relative mt-auto max-w-md pb-20">
          <h1 className="font-display text-4xl leading-[1.1] font-semibold tracking-[-0.02em] text-white">Watch over one application, carefully.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Run the tools, let the AI read the results, and verify every finding yourself before it reaches the report.
          </p>
          <ul className="mt-10 space-y-5">
            {RULES.map((r) => (
              <li key={r.title} className="border-l-2 border-brand-500/60 pl-4">
                <p className="text-sm font-semibold text-white">{r.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-400">{r.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center bg-paper px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <TanawMark className="h-9 w-9" />
            <span className="font-display text-2xl font-semibold tracking-tight text-ink-900">Tanaw</span>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-500">Use the account an admin created for you.</p>
          <div className="mt-6">
            <LoginForm />
          </div>
          <p className="mt-8 text-xs leading-relaxed text-ink-500">Every sign-in and action is recorded in the audit log.</p>
        </div>
      </section>
    </main>
  );
}
