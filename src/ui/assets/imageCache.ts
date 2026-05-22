const MAX_IMAGE_CACHE_ENTRIES = 400;
const HIT_TTL_MS = 1000 * 60 * 60 * 6;
const MISS_TTL_MS = 1000 * 60 * 5;
const FETCH_TIMEOUT_MS = 6000;

type ImageCacheEntry = {
  expiresAt: number;
  value: string | null;
  pending?: Promise<string | null>;
};

const imageCache = new Map<string, ImageCacheEntry>();

export async function fetchImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) {
    return null;
  }

  const now = Date.now();
  const cached = imageCache.get(url);
  if (cached?.pending) {
    return cached.pending;
  }
  if (cached && cached.expiresAt > now) {
    imageCache.delete(url);
    imageCache.set(url, cached);
    return cached.value;
  }

  const pending = downloadImageDataUri(url);
  imageCache.set(url, { expiresAt: now + MISS_TTL_MS, value: null, pending });
  trimImageCache();

  const value = await pending;
  imageCache.set(url, {
    expiresAt: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS),
    value
  });
  trimImageCache();
  return value;
}

async function downloadImageDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? inferImageMime(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function trimImageCache(): void {
  while (imageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    imageCache.delete(oldestKey);
  }
}

function inferImageMime(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerUrl.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerUrl.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
}
