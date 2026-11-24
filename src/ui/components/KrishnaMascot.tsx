export type KrishnaPose =
  | 'flute'
  | 'welcome'
  | 'eating_butter'
  | 'dancing'
  | 'butter_pot'
  | 'crawling'
  | 'blessing'
  | 'resting'
  | 'joyful';

interface KrishnaMascotProps {
  pose: KrishnaPose;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'badge';
  alt?: string;
  className?: string;
  floating?: boolean;
}

const POSE_FILES: Record<KrishnaPose, { file: string; defaultAlt: string }> = {
  flute: {
    file: '/assets/krishna/krishna_flute.png',
    defaultAlt: 'Cute Baby Krishna playing the divine flute with peacock feather crown',
  },
  welcome: {
    file: '/assets/krishna/krishna_welcome.png',
    defaultAlt: 'Cute Baby Krishna with welcoming open arms',
  },
  eating_butter: {
    file: '/assets/krishna/krishna_eating_butter.png',
    defaultAlt: 'Cute Baby Krishna enjoying freshly churned Makhan butter',
  },
  dancing: {
    file: '/assets/krishna/krishna_dancing.png',
    defaultAlt: 'Cute Baby Krishna dancing joyfully',
  },
  butter_pot: {
    file: '/assets/krishna/krishna_butter_pot.png',
    defaultAlt: 'Cute Baby Krishna beside the decorated earthen butter pot',
  },
  crawling: {
    file: '/assets/krishna/krishna_crawling.png',
    defaultAlt: 'Cute Baby Krishna playfully crawling towards the prasad',
  },
  blessing: {
    file: '/assets/krishna/krishna_blessing.png',
    defaultAlt: 'Cute Baby Krishna offering divine blessings',
  },
  resting: {
    file: '/assets/krishna/krishna_resting.png',
    defaultAlt: 'Cute Baby Krishna resting happily',
  },
  joyful: {
    file: '/assets/krishna/krishna_joyful.png',
    defaultAlt: 'Cute Baby Krishna with arms raised in festival celebration',
  },
};

export function KrishnaMascot({
  pose,
  size = 'md',
  alt,
  className = '',
  floating = false,
}: KrishnaMascotProps) {
  const info = POSE_FILES[pose] ?? POSE_FILES.welcome;
  const sizeClass = `krishna-mascot--${size}`;
  const floatClass = floating ? 'krishna-mascot--floating' : '';

  return (
    <div className={`krishna-mascot ${sizeClass} ${floatClass} ${className}`.trim()}>
      <div className="krishna-mascot__halo" aria-hidden="true" />
      <img
        src={info.file}
        alt={alt ?? info.defaultAlt}
        className="krishna-mascot__img"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
