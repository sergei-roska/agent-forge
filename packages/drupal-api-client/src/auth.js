/**
 * Auth strategy abstraction for Drupal API access.
 * Supports basic auth, bearer token, and API key.
 */
/**
 * Build HTTP headers from an auth strategy.
 */
export function authHeaders(auth) {
    if (!auth)
        return {};
    switch (auth.type) {
        case 'basic': {
            const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
            return { Authorization: `Basic ${encoded}` };
        }
        case 'bearer':
            return { Authorization: `Bearer ${auth.token}` };
        case 'api_key':
            return { [auth.headerName]: auth.key };
    }
}
