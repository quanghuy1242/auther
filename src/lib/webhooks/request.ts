import { WEBHOOK_ORIGIN_HEADER, WEBHOOK_ORIGIN_PAYLOAD } from "@/lib/constants";

export type RequestWithContext = Request & {
  context?: Record<string, unknown>;
};

export function getWebhookOrigin(request?: RequestWithContext) {
  if (!request) {
    return undefined;
  }

  const headerOrigin = request.headers.get(WEBHOOK_ORIGIN_HEADER);
  if (headerOrigin) {
    return headerOrigin;
  }

  const contextOrigin = request.context?.betterAuthOrigin;
  return typeof contextOrigin === "string" ? (contextOrigin as string) : undefined;
}

export function isPayloadOrigin(request?: RequestWithContext) {
  return getWebhookOrigin(request) === WEBHOOK_ORIGIN_PAYLOAD;
}
