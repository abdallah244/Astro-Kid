/**
 * Strict CSRF check for state-changing routes (POST / DELETE):
 * 1. Origin header (or Origin extracted from Referer) must exactly match SITE_ORIGIN.
 * 2. Content-Type must be application/json.
 */
export function verifyCsrf(siteOrigin) {
  const expectedOrigin = new URL(siteOrigin).origin;

  return async function csrfPreHandler(request, reply) {
    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return reply.code(403).send({ error: 'forbidden_content_type' });
    }

    const originHeader = request.headers.origin;
    const refererHeader = request.headers.referer;
    let requestOrigin = null;

    if (originHeader) {
      requestOrigin = String(originHeader);
    } else if (refererHeader) {
      try {
        requestOrigin = new URL(String(refererHeader)).origin;
      } catch {
        requestOrigin = null;
      }
    }

    if (!requestOrigin || requestOrigin !== expectedOrigin) {
      return reply.code(403).send({ error: 'forbidden_origin' });
    }
  };
}
