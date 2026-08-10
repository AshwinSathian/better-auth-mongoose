export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path
        d="M12 9c-2 0-3 1.3-3 3.2 0 1.3.6 2 1.3 2.6.2.2.2.4 0 .6-.7.6-1.3 1.3-1.3 2.6C9 21 10 22 12 22"
        stroke="var(--color-accent-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M20 9c2 0 3 1.3 3 3.2 0 1.3-.6 2-1.3 2.6-.2.2-.2.4 0 .6.7.6 1.3 1.3 1.3 2.6 0 2-1 3-3 3"
        stroke="var(--color-accent-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="16" r="1.6" className="fill-(--color-accent-ink)" />
    </svg>
  );
}
