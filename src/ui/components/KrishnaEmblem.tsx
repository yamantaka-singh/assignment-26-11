export function KrishnaEmblem() {
  return (
    <svg
      className="krishna-emblem"
      width="44"
      height="44"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Soft halo / aura */}
      <circle cx="24" cy="24" r="22" fill="url(#halo-grad)" opacity="0.22" />

      {/* Peacock feather (Mor Pankh) stem */}
      <path
        d="M19 36C20 30 23 20 31 12C33 10 35 8.5 37 8C36 10.5 34 13.5 32 17C28 23 23 29 20 36"
        stroke="#c85a17"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Feather vanes */}
      <path d="M26 15C29 13.5 33 13.5 34.5 14.5" stroke="#d98e1f" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M24 19C28 17.5 32 18 33 19.5" stroke="#d98e1f" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M22 23C26 22 29.5 22.5 31 24" stroke="#d98e1f" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M20.5 27C24 26 27 26.5 28.5 28" stroke="#d98e1f" strokeWidth="1.1" strokeLinecap="round" />

      {/* Feather outer eye */}
      <ellipse cx="30" cy="14" rx="4.5" ry="6" transform="rotate(28 30 14)" fill="#d98e1f" opacity="0.35" stroke="#c85a17" strokeWidth="1.1" />
      {/* Feather inner eye */}
      <ellipse cx="30" cy="14" rx="2.2" ry="3.2" transform="rotate(28 30 14)" fill="#c85a17" />
      <circle cx="30" cy="14" r="1.1" fill="#fffdfa" />

      {/* Bansuri (Divine Flute) */}
      <rect x="7" y="32" width="34" height="4.2" rx="2.1" transform="rotate(-18 7 32)" fill="url(#flute-grad)" stroke="#c85a17" strokeWidth="1" />
      {/* Flute tone holes */}
      <circle cx="17.5" cy="28.8" r="0.9" fill="#1c2026" opacity="0.8" />
      <circle cx="21.5" cy="27.5" r="0.9" fill="#1c2026" opacity="0.8" />
      <circle cx="25.5" cy="26.2" r="0.9" fill="#1c2026" opacity="0.8" />
      <circle cx="29.5" cy="24.9" r="0.9" fill="#1c2026" opacity="0.8" />

      {/* Flute decorative tassel */}
      <line x1="11.5" y1="31" x2="10.5" y2="34" stroke="#d98e1f" strokeWidth="1.4" />
      <circle cx="10" cy="35.5" r="1.2" fill="#c85a17" />
      <path d="M10 36.8L9 40.5M10 36.8L10 41M10 36.8L11 40.5" stroke="#d98e1f" strokeWidth="0.8" strokeLinecap="round" />

      <defs>
        <radialGradient id="halo-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e5aa42" />
          <stop offset="100%" stopColor="#c85a17" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="flute-grad" x1="0" y1="0" x2="34" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fdf3e2" />
          <stop offset="45%" stopColor="#e8b150" />
          <stop offset="100%" stopColor="#c85a17" />
        </linearGradient>
      </defs>
    </svg>
  );
}
