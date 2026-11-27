/** The Buzzbite wordmark, white in dark mode. */
export function Wordmark({ height = 24 }: { height?: number }) {
  return (
    <picture>
      <source srcSet="/brand/wordmark-white.png" media="(prefers-color-scheme: dark)" />
      <img src="/brand/wordmark.png" alt="Buzzbite" height={height} width={Math.round(height * (2000 / 393))} style={{ display: "block", height, width: "auto" }} />
    </picture>
  );
}
