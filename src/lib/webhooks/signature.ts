import crypto from "node:crypto";

const ALGORITHM = "sha256";

export function createWebhookSignature(body: string, secret: string) {
  return crypto.createHmac(ALGORITHM, secret).update(body).digest("hex");
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
