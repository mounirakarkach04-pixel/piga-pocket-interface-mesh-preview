const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-site",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
});

function governed(response, options = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set("permissions-policy", options.allowMic ? "camera=(), microphone=(self), geolocation=()" : "camera=(), microphone=(), geolocation=()");
  headers.set("x-piga-edge", "showroom-proxy-governed");
  headers.set("x-piga-authority", "none");
  headers.set("x-piga-a7sem", "admission-before-inference");
  headers.set("x-piga-a7sem-reverse", "required-after-evidence");
  if (options.noStore) headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createUpstreamRequest(request, showroomOrigin) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, showroomOrigin);
  const upstreamRequest = new Request(upstreamUrl, request);
  const headers = new Headers(upstreamRequest.headers);
  for (const name of ["host", "cf-connecting-ip", "true-client-ip", "x-forwarded-for", "x-real-ip"]) headers.delete(name);
  headers.set("x-forwarded-host", incomingUrl.host);
  return new Request(upstreamRequest, { headers, redirect: "follow" });
}

async function fetchShowroom(request, showroomOrigin) {
  return fetch(createUpstreamRequest(request, showroomOrigin));
}

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

const SUPABASE_URL = "https://qjvopzschqukitvudgfz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fDsruYO5WHEqKVRjNEl9Rg_dYpSMrYg";
const BLOCKED = /\b(selbstmord|suizid|self[- ]?harm|porn|nackt|nude|waffe|bombe|drogen|passwort|geheimnis|standort|adresse)\b/i;

async function verifyUser(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: authHeader },
  });
  if (!r.ok) return null;
  return r.json();
}

async function happyReply(request, env) {
  if (request.method !== "POST") return governed(Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 }), { noStore: true });
  const user = await verifyUser(request.headers.get("authorization"));
  if (!user?.id) return governed(Response.json({ error: "AUTH_REQUIRED" }, { status: 401 }), { noStore: true });
  const body = await request.json().catch(() => ({}));
  const message = String(body?.message || "").trim().slice(0, 1200);
  if (!message) return governed(Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 }), { noStore: true });
  if (BLOCKED.test(message)) return governed(Response.json({ answer: "Dabei kann ich nicht helfen. Für sensible oder gefährliche Themen hol bitte eine vertrauenswürdige Person dazu.", mode: "guarded", governance: { admission: "BLOCK", reverse: "BLOCK" } }), { noStore: true });
  if (!env.GEMINI_API_KEY) return governed(Response.json({ answer: "Happy ist gerade nicht mit dem KI-Dienst verbunden. Deine Familienfunktionen bleiben verfügbar.", mode: "unavailable", governance: { admission: "ALLOW", reverse: "UNKNOWN" } }, { status: 503 }), { noStore: true });

  const system = "Du bist Happy, die freundliche Sprach-KI in Nadias Bloom Family App. Antworte auf Deutsch, warm, ruhig, praktisch und knapp. Du hilfst bei Familienorganisation, Alltag, Essensideen, Routinen, Terminen, Listen und freundlicher Motivation. Du behauptest niemals, Aktionen außerhalb der App ausgeführt zu haben. Keine medizinische, rechtliche oder finanzielle Autorität. Bei Unsicherheit sagst du es klar. A7SEM: vor jeder Antwort Scope und Risiko prüfen. A7SEM Reverse: nach der Antwort prüfen, ob sie innerhalb des zugelassenen Scopes blieb. Inference ist keine Action.";
  const model = env.GEMINI_MODEL || "gemini-3.7-flash";
  const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: 450 },
    }),
  });
  if (!g.ok) return governed(Response.json({ answer: "Happy konnte gerade keine sichere Antwort erzeugen. Versuch es bitte gleich noch einmal.", mode: "unavailable", governance: { admission: "ALLOW", reverse: "UNKNOWN" } }, { status: 502 }), { noStore: true });
  const data = await g.json();
  const answer = String(data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("") || "").trim();
  if (!answer) return governed(Response.json({ answer: "Dazu habe ich gerade keine verlässliche Antwort.", mode: "unknown", governance: { admission: "ALLOW", reverse: "UNKNOWN" } }), { noStore: true });
  return governed(Response.json({ answer, mode: "gemini", governance: { admission: "ALLOW", reverse: "ALLOW", sequence: "A7SEM -> inference -> evidence -> A7SEM Reverse" }, authority: "inference-only" }), { noStore: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return governed(Response.json({
        status: "ok",
        service: "piga-pocket-interface-mesh-preview",
        environment: env.APP_ENV,
        sourceCommit: env.SOURCE_COMMIT,
        routeMode: "piga-showroom-proxy",
        showroomOrigin: env.SHOWROOM_ORIGIN,
        authority: "none",
        engineCount: 5,
        a7semReverse: "continuous-meta-operator",
        a7semReverseIsEngine: false,
        fallback: "static-interface-mesh",
        nadiasBloom: { auth: "supabase-email-otp", voiceAi: "happy-gemini" }
      }), { noStore: true });
    }

    if (url.pathname === "/api/nadia/happy") return happyReply(request, env);

    if (url.pathname === "/nadia" || url.pathname.startsWith("/nadia/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return governed(Response.json({ error: "METHOD_NOT_ALLOWED", authority: "none" }, { status: 405 }), { noStore: true, allowMic: true });
      }
      const path = url.pathname === "/nadia" || url.pathname === "/nadia/" ? "/nadia/index.html" : url.pathname;
      return governed(await env.ASSETS.fetch(assetRequest(request, path)), { allowMic: true });
    }

    try {
      const upstreamResponse = await fetchShowroom(request, env.SHOWROOM_ORIGIN);
      if (upstreamResponse.status < 500) return governed(upstreamResponse, { noStore: request.method !== "GET" });
      console.error(JSON.stringify({ event: "showroom_upstream_unavailable", status: upstreamResponse.status, path: url.pathname }));
    } catch (error) {
      console.error(JSON.stringify({ event: "showroom_upstream_error", message: error instanceof Error ? error.message : "unknown", path: url.pathname }));
    }

    if (request.method === "GET" || request.method === "HEAD") return governed(await env.ASSETS.fetch(request));
    return governed(Response.json({ error: "SHOWROOM_UPSTREAM_UNAVAILABLE", authority: "none", gate: "closed" }, { status: 503 }), { noStore: true });
  }
};
