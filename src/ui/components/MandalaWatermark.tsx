export function MandalaWatermark({ position }: { readonly position: 'top-right' | 'bottom-left' }) {
  const className = `mandala-watermark mandala-watermark--${position}`;
  return (
    <picture>
      <source srcSet="/assets/mandala.webp" type="image/webp" />
      <img
        src="/assets/mandala.png"
        alt=""
        aria-hidden="true"
        className={className}
        width="480"
        height="480"
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
