import { getApiErrorMessage } from './apiError';

function stripMarkup(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function parseJsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  const raw = await response.text();
  let parsed: unknown = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      const preview = stripMarkup(raw).slice(0, 180) || `${response.status} ${response.statusText}`;
      throw new Error(response.ok ? `Invalid server response: ${preview}` : preview);
    }
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(parsed, fallback));
  }

  return parsed as T;
}

export async function fetchJsonOrThrow<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallback: string
): Promise<T> {
  const response = await fetch(input, init);
  return parseJsonOrThrow<T>(response, fallback);
}
