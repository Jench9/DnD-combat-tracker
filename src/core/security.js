// HTTP hardening shared by every route: security headers, a same-origin
// check for requests that change things, and a small in-memory rate
// limiter (login attempts). No dependencies.

// Security headers. The pages load scripts only from this server (no inline
// scripts), styles from here + Google Fonts, images from here or data:
// URLs (portraits), and talk only to this server (REST + WebSocket).
function securityHeaders(req, res, next) {
  const host = req.get('host') || '';
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      `connect-src 'self' ws://${host} wss://${host}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
}

// Is the browser's Origin (or Referer) this server? Requests without
// either (curl, the tests) pass: browsers always send Origin on
// cross-site POSTs and WebSocket handshakes, which is what this guards.
function sameOrigin(req) {
  const origin = req.headers.origin || '';
  const source = origin || req.headers.referer || '';
  if (!source) return true;
  try {
    return new URL(source).host === (req.headers['x-forwarded-host'] || req.headers.host);
  } catch {
    return false;
  }
}

// REST: refuse cross-site requests that change things (a page elsewhere
// posting with the visitor's session cookie).
function requireSameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || sameOrigin(req)) return next();
  res.status(403).json({ error: 'Cross-site request refused.' });
}

// At most `max` hits per key in `windowMs`. hit(key) -> ms to wait (0 = ok);
// wait(key) -> the same without counting (to count only failures).
function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    wait(key) {
      const h = hits.get(key);
      return h && h.resetAt > Date.now() && h.count >= max ? h.resetAt - Date.now() : 0;
    },
    hit(key) {
      const t = Date.now();
      let h = hits.get(key);
      if (!h || h.resetAt <= t) { h = { count: 0, resetAt: t + windowMs }; hits.set(key, h); }
      h.count += 1;
      if (hits.size > 10000) { for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k); } // keep it small
      return h.count > max ? h.resetAt - t : 0;
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = { securityHeaders, sameOrigin, requireSameOrigin, createRateLimiter };
