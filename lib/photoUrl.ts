// Photo URL helpers. Google Places photo URLs accept a `maxWidthPx`
// parameter that controls the resolution returned. The pipeline saves
// every photo at maxWidthPx=800 because that's plenty for card sized
// renderings (cards are ≤400px wide, 800 = 2x retina).
//
// On the gym detail page, the hero photo can render at ~1200px wide on
// a desktop monitor. At 2x retina that needs ~2400px — at the 800px
// default, the hero looks soft/pixelated. The lightbox modal can show
// the photo at the full viewport, even larger.
//
// `withWidth` rewrites the saved URL to request a higher resolution
// from Google. No re-saving needed; the URL itself encodes the size.
//
// Google's max is 4800; pick a value that fits the actual render size
// at 2x retina, not the maximum.

const MAX_GOOGLE_WIDTH = 4800;

/** Return a copy of the photo URL with the given maxWidthPx. Falls back
 *  to the original URL when it isn't a Places URL or has no width param.
 *  Pass `undefined`/`null` and you get `undefined` back (so callers can
 *  pipe a possibly-null `gym.photo_url` through). */
export function withWidth(
  url: string | null | undefined,
  maxWidth: number,
): string | undefined {
  if (!url) return undefined;
  const target = Math.min(Math.max(Math.round(maxWidth), 1), MAX_GOOGLE_WIDTH);
  // The saved URLs look like: …/media?maxWidthPx=800&key=…
  if (/[?&]maxWidthPx=\d+/.test(url)) {
    return url.replace(/([?&])maxWidthPx=\d+/, `$1maxWidthPx=${target}`);
  }
  // Non-Places photo URL or one we don't know how to upscale — return
  // it as-is rather than risk breaking something.
  return url;
}

/** Convenience wrappers for common surfaces. Tweak in one place. */
export const PhotoSize = {
  /** List card / popover card / mobile sheet — ~400px display. */
  card: (url: string | null | undefined) => withWidth(url, 800),
  /** Gym page hero — ~1200px display on desktop, retina friendly. */
  hero: (url: string | null | undefined) => withWidth(url, 1920),
  /** Lightbox modal — fills viewport. Crisp on 4K-ish monitors. */
  lightbox: (url: string | null | undefined) => withWidth(url, 2400),
};
