// Rejects requests sent by other sites. Behind a proxy or tunnel (e.g. VS Code port forwarding to a phone) the server
// sees http://localhost:3000 while the browser's Origin is the public HTTPS address, so forwarded hosts count as ours.
export function isCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).host; } catch { return true; }
  const forwarded = (request.headers.get("x-forwarded-host") ?? "").split(",").map(h => h.trim());
  return ![new URL(request.url).host, request.headers.get("host"), ...forwarded].includes(host);
}
