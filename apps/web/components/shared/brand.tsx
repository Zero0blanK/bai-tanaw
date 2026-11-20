/** Bai-Tanaw's mark: a red square with a white lookout eye ("to watch over"). Swiss red, used nowhere decoratively. */
export function TanawMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" fill="#d52b1e" />
      <path d="M5 16c3-5.3 6.8-8 11-8s8 2.7 11 8c-3 5.3-6.8 8-11 8S8 21.3 5 16Z" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="miter" />
      <rect x="12.5" y="12.5" width="7" height="7" fill="#ffffff" />
    </svg>
  );
}
