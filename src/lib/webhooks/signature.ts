import crypto from "node:crypto";

const ALGORITHM = "sha256";

function buildTimestampBoundMessage(body: string, timestampMs: number | string) {
  return `${String(timestampMs)}.${body}`;
}

export function createWebhookSignature(body: string, secret: string) {
  return crypto.createHmac(ALGORITHM, secret).update(body).digest("hex");
}

export function createWebhookSignatureWithTimestamp(
  body: string,
  secret: string,
  timestampMs: number | string
) {
  return crypto
    .createHmac(ALGORITHM, secret)
    .update(buildTimestampBoundMessage(body, timestampMs))
    .digest("hex");
}

export function verifyWebhookSignature(body: string, signature: string, secret: string) {
  const expectedSignature = createWebhookSignature(body, secret);
  const provided = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

export function verifyWebhookSignatureWithTimestamp(
  body: string,
  signature: string,
  secret: string,
  timestampMs: number | string
) {
  const expectedSignature = createWebhookSignatureWithTimestamp(body, secret, timestampMs);
  const provided = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}
