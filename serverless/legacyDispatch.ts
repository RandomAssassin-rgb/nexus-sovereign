import type { VercelRequest, VercelResponse } from '@vercel/node';
import { legacyManifest } from './legacyManifest';
import { verifyAdmin, verifyUser } from './_lib/auth';

type GroupName = keyof typeof legacyManifest;

function getRouteSegments(req: VercelRequest): string[] {
  const route = req.query.route;

  if (Array.isArray(route)) {
    return route.filter(Boolean);
  }

  if (typeof route === 'string' && route.trim()) {
    return route.split('/').filter(Boolean);
  }

  return [];
}

function matchDynamicRoute(pattern: string, routeKey: string) {
  const patternSegments = pattern.split('/');
  const routeSegments = routeKey.split('/');

  if (patternSegments.length !== routeSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const routeSegment = routeSegments[index];

    if (patternSegment.startsWith('[') && patternSegment.endsWith(']')) {
      params[patternSegment.slice(1, -1)] = routeSegment;
      continue;
    }

    if (patternSegment !== routeSegment) {
      return null;
    }
  }

  return params;
}

export async function dispatchLegacyHandler(
  group: GroupName,
  req: VercelRequest,
  res: VercelResponse
) {
  const manifest = legacyManifest[group];
  const segments = getRouteSegments(req);
  
  // Vercel's req.query.route might be empty if the rewrite didn't pass it as a query param
  // but instead relied on the URL path.
  let routeKey = segments.join('/');
  
  if (!routeKey && req.url) {
      const urlWithoutQuery = req.url.split('?')[0];
      const match = urlWithoutQuery.match(new RegExp(`/api/${group}/(.*)`));
      if (match) routeKey = match[1];
  }

  let loader = manifest[routeKey];
  let params: Record<string, string> | null = null;

  if (!loader) {
    for (const [pattern, candidateLoader] of Object.entries(manifest)) {
      if (!pattern.includes('[')) continue;

      const matchedParams = matchDynamicRoute(pattern, routeKey);
      if (matchedParams) {
        loader = candidateLoader;
        params = matchedParams;
        break;
      }
    }
  }

  if (!loader) {
    return res.status(404).json({
      error: 'Not Found',
      route: `/api/${group}/${routeKey}`,
    });
  }

  // --- Production Auth Guard Layer ---
  // Admin auth endpoints must be publicly accessible (they establish the session)
  const isAdminAuthRoute = group === 'admin' && routeKey.startsWith('auth/');
  try {
    if (group === 'admin' && !isAdminAuthRoute) {
      await verifyAdmin(req);
    } else if (['user', 'claims'].includes(group)) {
      await verifyUser(req);
    } else if (group === 'finance') {
      // Guard everything except Razorpay webhooks
      if (!routeKey.toLowerCase().includes('razorpay')) {
        await verifyUser(req);
      }
    }
    // 'auth', 'system', and 'intelligence' (e.g. public indicators) are generally open
    // or have internal specialized logic.
  } catch (err: any) {
    const message = err.message || 'Unauthorized';
    const status = message.includes('Forbidden') ? 403 : 401;
    return res.status(status).json({ error: message });
  }

  if (params) {
    (req as any).query = {
      ...req.query,
      ...params,
    };
  }

  const module = await loader();
  return module.default(req, res);
}

