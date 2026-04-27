import { NextRequest, NextResponse } from 'next/server';

// In-memory sliding window rate limiter (per Vercel instance — effective with Fluid Compute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Clean up stale entries every 500 requests to prevent memory leak
let cleanupCounter = 0;
function cleanupStale() {
  if (++cleanupCounter < 500) return;
  cleanupCounter = 0;
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (val.resetAt < now) rateLimitMap.delete(key);
  }
}

function rateLimit(ip: string, limit: number, windowMs: number): boolean {
  cleanupStale();
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Known scraper/bot user-agent patterns
const BOT_PATTERNS = [
  /python-requests/i,
  /scrapy/i,
  /wget/i,
  /curl\//i,
  /axios\//i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
  /mechanize/i,
  /scraperapi/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /httpclient/i,
  /okhttp/i,
  /ruby/i,
];

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=()',
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // Apply security headers to all responses
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }

  if (!isApi) return res;

  // Block known scrapers on API routes
  const ua = req.headers.get('user-agent') ?? '';
  if (BOT_PATTERNS.some(p => p.test(ua))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // CORS — only allow requests from our own origin
  const origin = req.headers.get('origin');
  if (origin && !origin.match(/https?:\/\/(matfinder\.io|matfinder\.app|localhost)/)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Get real IP (Vercel forwards it in x-forwarded-for)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // Stricter limit on /api/gyms (bulk data endpoint)
  if (pathname === '/api/gyms') {
    const allowed = rateLimit(`gyms:${ip}`, 15, 60_000); // 15 req/min
    if (!allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    }
  } else {
    // General API rate limit
    const allowed = rateLimit(`api:${ip}`, 60, 60_000); // 60 req/min
    if (!allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    }
  }

  // Block requests with no user-agent entirely on bulk endpoint
  if (pathname === '/api/gyms' && !ua) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)'],
};
