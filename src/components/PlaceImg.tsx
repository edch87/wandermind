import { useState } from 'react';
import type { Category } from '../types';
import PlaceholderImage from './PlaceholderImage';

interface Props {
  src?: string | null;
  alt: string;
  category: Category;
  /** Shown overlaid on the placeholder when no photo is available. */
  name?: string;
  /** Pass-through className applied to the rendered <img> when a photo loads. */
  className?: string;
  /** Variant passed to PlaceholderImage when a photo is missing or fails. */
  placeholderVariant?: 'card' | 'detail';
  loading?: 'lazy' | 'eager';
}

/**
 * Single source of truth for rendering a place photo with a graceful fallback.
 *
 * Reasons to centralise this rather than repeat the `onError` swap in every
 * surface:
 *   1. Network 404s, Wikimedia hotlink blocks, and stale URLs all converge here.
 *   2. PlaceholderImage gets the place name + category and can render a designed
 *      fallback (serif title over a category-tinted gradient).
 *   3. Future improvements (skeleton, blurhash, manual upload) only need to be
 *      wired in one place.
 */
export default function PlaceImg({
  src,
  alt,
  category,
  name,
  className = 'place-img',
  placeholderVariant = 'card',
  loading = 'lazy',
}: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <PlaceholderImage
        category={category}
        name={name}
        variant={placeholderVariant}
        className="absolute inset-0"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
