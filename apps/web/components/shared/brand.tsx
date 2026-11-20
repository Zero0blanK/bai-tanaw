/** Tanaw's mark: an eye-shaped lookout with a horizon line, "to watch over". */
export function TanawMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0f766e" />
      <path d="M5 16c3-5.3 6.8-8 11-8s8 2.7 11 8c-3 5.3-6.8 8-11 8S8 21.3 5 16Z" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="3.6" fill="#ffffff" />
      <path d="M16 4v3M16 25v3" stroke="#6cc7b8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
