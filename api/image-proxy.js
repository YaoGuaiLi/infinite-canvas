// Vercel Edge Function: image proxy that adds CORS so browser fetch can
// persist remote images (e.g. APIMart's getapib.org host has no CORS headers).
// Served at /api/image-proxy?url=... (same origin as the app).
export const config = { runtime: "edge" };

export default async function handler(request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const origin = request.headers.get("origin") || "*";

    const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "*",
        "cache-control": "public, max-age=86400",
    };
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
    }
    if (!url || !/^https?:\/\//i.test(url)) {
        return new Response(JSON.stringify({ error: "Invalid url" }), { status: 400, headers: { ...headers, "content-type": "application/json" } });
    }
    try {
        const upstream = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36", "Accept": "image/*,*/*;q=0.8" },
        });
        if (!upstream.ok) {
            return new Response(JSON.stringify({ error: `Upstream ${upstream.status}` }), { status: 502, headers: { ...headers, "content-type": "application/json" } });
        }
        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        return new Response(upstream.body, { status: 200, headers: { ...headers, "content-type": contentType } });
    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), { status: 502, headers: { ...headers, "content-type": "application/json" } });
    }
}