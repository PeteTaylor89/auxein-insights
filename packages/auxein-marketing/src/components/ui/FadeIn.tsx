interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger offset in seconds. A delay opts out of the scroll-driven timeline,
   *  which ignores time-based delays and would flatten the stagger. */
  delay?: number;
}

/* Reveal-on-enter with no JavaScript: the animation lives in globals.css, so
   the content is readable whether or not React hydrates. Deliberately not a
   client component — that lets server components such as /about use it without
   giving up their `metadata` export. */
export function FadeIn({ children, className, delay }: FadeInProps) {
  return (
    <div
      className={[className, 'reveal', delay ? '' : 'reveal-on-scroll']
        .filter(Boolean)
        .join(' ')}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
