type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

function readMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (value instanceof Error) {
    return readMessage(value.message);
  }

  if (!isRecord(value)) {
    return null;
  }

  const nestedError = readMessage(value.error);
  if (nestedError) {
    return nestedError;
  }

  const message = readMessage(value.message);
  if (message) {
    const code = readMessage(value.code);
    return code ? `${message} (${code})` : message;
  }

  return null;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error) && isRecord(error.response) && "data" in error.response) {
    const responseMessage = readMessage(error.response.data);
    if (responseMessage) {
      return responseMessage;
    }
  }

  const directMessage = readMessage(error);
  if (directMessage) {
    return directMessage;
  }

  return fallback;
}
