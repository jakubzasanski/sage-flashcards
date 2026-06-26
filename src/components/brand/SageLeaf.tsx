import { useId } from "react";

interface SageLeafProps {
  size?: number;
  className?: string;
}

// React form of the Sage mark (for use inside React islands). Mirrors
// SageLeaf.astro — two curved leaves with a delicate midrib; `useId()` keeps
// the gradient ids unique per instance.
export function SageLeaf({ size = 30, className }: SageLeafProps) {
  const lg = useId();
  const deep = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={lg} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#a6d68d" />
          <stop offset="0.52" stopColor="#5f9a53" />
          <stop offset="1" stopColor="#3a6739" />
        </linearGradient>
        <linearGradient id={deep} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4e7c4d" />
          <stop offset="1" stopColor="#2c5130" />
        </linearGradient>
      </defs>
      <g transform="translate(8,6) rotate(18 48 48) scale(0.78)">
        <path d="M34 84C18 60 24 26 70 14 70 44 60 74 34 84Z" fill={`url(#${deep})`} />
      </g>
      <g transform="translate(-4,2) rotate(-8 48 48) scale(0.92)">
        <path d="M34 84C18 60 24 26 70 14 70 44 60 74 34 84Z" fill={`url(#${lg})`} />
        <path
          d="M34 84C44 60 56 36 68 18"
          stroke="#fff"
          strokeOpacity="0.6"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
