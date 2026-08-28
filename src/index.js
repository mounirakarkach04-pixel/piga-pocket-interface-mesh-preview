const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-site",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
});

function governed(response, noStore = false) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set("x-piga-edge", "showroom-proxy-governed");
  headers.set("x-piga-authority", "none");
  if (noStore) headers.set("cache-control", "no-store");
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

  for (const name of ["host", "cf-connecting-ip", "true-client-ip", "x-forwarded-for", "x-real-ip"]) {
    headers.delete(name);
  }
  headers.set("x-forwarded-host", incomingUrl.host);

  return new Request(upstreamRequest, {
    headers,
    redirect: "follow",
  });
}

async function fetchShowroom(request, showroomOrigin) {
  return fetch(createUpstreamRequest(request, showroomOrigin));
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
        fallback: "static-interface-mesh"
      }), true);
    }

    try {
      const upstreamResponse = await fetchShowroom(request, env.SHOWROOM_ORIGIN);
      if (upstreamResponse.status < 500) return governed(upstreamResponse, request.method !== "GET");

      console.error(JSON.stringify({
        event: "showroom_upstream_unavailable",
        status: upstreamResponse.status,
        path: url.pathname
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "showroom_upstream_error",
        message: error instanceof Error ? error.message : "unknown",
        path: url.pathname
      }));
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return governed(await env.ASSETS.fetch(request));
    }

    return governed(Response.json({
      error: "SHOWROOM_UPSTREAM_UNAVAILABLE",
      authority: "none",
      gate: "closed"
    }, { status: 503 }), true);
  }
};
