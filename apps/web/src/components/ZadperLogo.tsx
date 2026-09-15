type ZadperLogoProps = {
  className?: string;
  decorative?: boolean;
  variant?: "icon" | "full";
};

export function ZadperLogo({ className = "", decorative = false, variant = "icon" }: ZadperLogoProps) {
  return (
    <span className={`zadper-logo ${variant} ${className}`}>
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={decorative ? true : undefined}
        className="zadper-logo-mark"
      >
        <defs>
          <radialGradient id="zadper-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(38 92% 65%)" />
            <stop offset="55%" stopColor="hsl(270 70% 55%)" />
            <stop offset="100%" stopColor="hsl(260 60% 30%)" />
          </radialGradient>
          <radialGradient id="zadper-pupil" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(260 100% 90%)" />
            <stop offset="40%" stopColor="hsl(270 80% 65%)" />
            <stop offset="100%" stopColor="hsl(270 70% 40%)" />
          </radialGradient>
          <linearGradient id="zadper-facet-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(270 80% 75% / 0.55)" />
            <stop offset="100%" stopColor="hsl(270 70% 55% / 0.1)" />
          </linearGradient>
          <linearGradient id="zadper-facet-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(38 90% 70% / 0.45)" />
            <stop offset="100%" stopColor="hsl(270 70% 55% / 0.08)" />
          </linearGradient>
          <filter id="zadper-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="zadper-soft-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#zadper-soft-glow)">
          <polygon
            points="24,4 42,16 42,32 24,44 6,32 6,16"
            fill="url(#zadper-core)"
            stroke="hsl(270 80% 72% / 0.4)"
            strokeWidth="0.75"
          />
          <polygon
            points="24,10 36,18 36,30 24,38 12,30 12,18"
            fill="url(#zadper-facet-a)"
          />
          <polygon
            points="24,10 36,18 36,30 24,38 12,30 12,18"
            fill="url(#zadper-facet-b)"
            opacity="0.6"
          />
        </g>

        <g filter="url(#zadper-glow)">
          <ellipse cx="24" cy="24" rx="9" ry="11" fill="url(#zadper-pupil)" />
          <circle cx="24" cy="24" r="4.5" fill="hsl(260 40% 10%)" />
          <circle cx="24" cy="24" r="2.2" fill="hsl(260 100% 88%)" />
          <circle cx="22" cy="22" r="1.3" fill="hsl(0 0% 100% / 0.9)" />
        </g>

        <g opacity="0.35">
          <polygon
            points="24,2 44,16 44,32 24,46 4,32 4,16"
            fill="none"
            stroke="hsl(270 80% 72%)"
            strokeWidth="0.5"
          />
        </g>
      </svg>

      {variant === "full" ? (
        <span className="zadper-logo-wordmark" aria-label="Zadper">
          <span className="zadper-logo-z">Z</span>
          <span className="zadper-logo-rest">adper</span>
        </span>
      ) : null}
    </span>
  );
}
