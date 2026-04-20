import { CHROME_UA, X_PUBLIC_BEARER, loadBrowserSessionConfig, loadEnv } from './config.mjs';
import { extractChromeXCookies } from './chrome-cookies.mjs';
import { extractFirefoxXCookies } from './firefox-cookies.mjs';

function parseCt0FromCookie(cookieHeader) {
  const match = cookieHeader.match(/(?:^|;\s*)ct0=([^;]+)/);
  return match ? match[1] : null;
}

export function resolveSession(options = {}) {
  loadEnv();

  if (options.csrfToken) {
    return {
      cookieHeader: options.cookieHeader ?? `ct0=${options.csrfToken}`,
      csrfToken: options.csrfToken
    };
  }

  if (Array.isArray(options.cookies) && options.cookies.length > 0) {
    const [ct0, authToken] = options.cookies;
    if (!ct0) throw new Error('Expected --cookies <ct0> [auth_token].');
    return {
      csrfToken: ct0,
      cookieHeader: authToken ? `ct0=${ct0}; auth_token=${authToken}` : `ct0=${ct0}`
    };
  }

  const cookieHeader = process.env.X_COOKIE_HEADER?.trim();
  const authToken = process.env.X_AUTH_TOKEN?.trim();
  const csrfToken = process.env.X_CT0?.trim();

  if (cookieHeader) {
    const derivedCt0 = csrfToken || parseCt0FromCookie(cookieHeader);
    if (!derivedCt0) {
      throw new Error('X_COOKIE_HEADER is set, but no ct0 cookie was found. Set X_CT0 explicitly or include ct0 in the cookie header.');
    }
    return { cookieHeader, csrfToken: derivedCt0 };
  }

  if (authToken && csrfToken) {
    return {
      cookieHeader: `auth_token=${authToken}; ct0=${csrfToken}`,
      csrfToken
    };
  }

  const config = loadBrowserSessionConfig({ browserId: options.browser });
  if (config.browser.cookieBackend === 'firefox') {
    return extractFirefoxXCookies(options.firefoxProfileDir);
  }

  const chromeUserDataDir = options.chromeUserDataDir ?? config.chromeUserDataDir;
  const chromeProfileDirectory = options.chromeProfileDirectory ?? config.chromeProfileDirectory;
  return extractChromeXCookies(chromeUserDataDir, chromeProfileDirectory, config.browser);
}

export function diagnoseSessionOptions(options = {}) {
  loadEnv();
  try {
    const config = loadBrowserSessionConfig({ browserId: options.browser });
    return {
      mode: 'browser',
      browser: config.browser.id,
      browserDisplayName: config.browser.displayName,
      chromeUserDataDir: config.chromeUserDataDir,
      chromeProfileDirectory: config.chromeProfileDirectory
    };
  } catch (error) {
    return {
      mode: 'manual',
      hasCookieHeader: Boolean(process.env.X_COOKIE_HEADER),
      hasAuthToken: Boolean(process.env.X_AUTH_TOKEN),
      hasCt0: Boolean(process.env.X_CT0),
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function buildHeaders(session) {
  return {
    authorization: `Bearer ${X_PUBLIC_BEARER}`,
    'content-type': 'application/json',
    'user-agent': CHROME_UA,
    'x-csrf-token': session.csrfToken,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    cookie: session.cookieHeader
  };
}
