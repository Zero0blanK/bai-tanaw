import type { Metadata } from 'next';
import { TanawMark } from '@/components/shared/brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

/** The three rules the platform is built on, shown before anyone signs in. They are a real sequence of duties. */
const RULES = [
  { title: 'Authorized targets only', body: 'Every request is checked against the allowlist and the target’s scope before it leaves.' },
  { title: 'Secrets never leave', body: 'Credentials and personal data are stripped before anything is stored or sent to the AI.' },
  { title: 'People decide', body: 'Tools and the AI only suggest. An assessor confirms every finding.' },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-full bg-white lg:grid-cols-12">
      <section className="hidden border-r-[3px] border-black px-12 py-10 lg:col-span-7 lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <TanawMark className="h-9 w-9" />
          <span className="text-sm font-bold text-black">Security assessment platform</span>
        </div>
        <h1 className="mt-auto font-display text-[clamp(3.5rem,7.5vw,7.5rem)] leading-[0.85] font-extrabold text-black">Bai-Tanaw</h1>
        <p className="mt-6 max-w-md text-lg leading-snug text-ink-700">To watch over one application, carefully: run the tools, let the AI read the output, and decide every finding yourself.</p>
        <ol className="mt-12 grid grid-cols-3 border-t-[3px] border-black">
          {RULES.map((r, i) => (
            <li key={r.title} className={i > 0 ? 'border-l border-ink-200 pt-4 pl-5' : 'pt-4 pr-5'}>
              <p className="font-display text-3xl font-extrabold tabular-nums text-black">{i + 1}</p>
              <p className="mt-2 text-sm font-bold text-black">{r.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{r.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex items-center px-4 py-12 sm:px-10 lg:col-span-5">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <TanawMark className="h-9 w-9" />
            <span className="font-display text-3xl font-extrabold text-black">Bai-Tanaw</span>
          </div>
          <h2 className="border-b-[3px] border-black pb-3 font-display text-4xl font-extrabold text-black">Sign in</h2>
          <p className="mt-3 text-sm text-ink-600">Use the account an admin created for you.</p>
          <div className="mt-8">
            <LoginForm />
          </div>
          <p className="mt-10 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-500">Every sign-in and action is recorded in the audit log.</p>
        </div>
      </section>
    </main>
  );
}
