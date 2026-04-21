import { getApiErrorMessage } from './apiError';
function stripMarkup(value) {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
export async function parseJsonOrThrow(response, fallback) {
    const raw = await response.text();
    let parsed = null;
    if (raw) {
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            const preview = stripMarkup(raw).slice(0, 180) || `${response.status} ${response.statusText}`;
            throw new Error(response.ok ? `Invalid server response: ${preview}` : preview);
        }
    }
    if (!response.ok) {
        throw new Error(getApiErrorMessage(parsed, fallback));
    }
    return parsed;
}
export async function fetchJsonOrThrow(input, init, fallback) {
    const response = await fetch(input, init);
    return parseJsonOrThrow(response, fallback);
}
//# sourceMappingURL=fetchJson.js.map