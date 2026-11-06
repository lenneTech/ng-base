import { isLtAuthEndpoint, ltPathOf } from './auth-urls';

/** How long a positive ("session is alive") verdict is reused. Only `true` is cached, never `false` or "no verdict". */
export const LT_SESSION_ALIVE_TTL_MS = 1000;
/** How long the guard is held after a logout, so a burst of parallel 401s redirects once. */
export const LT_SESSION_LOSS_GUARD_MS = 1000;

/** What the detector needs from the auth service. */
export interface LtSessionLossHost {
  clearUser(): void;
  /** Current router URL (full path incl. query), `null` when unknown. */
  currentUrl(): string | null;
  isAuthenticated(): boolean;
  isJwtMode(): boolean;
  navigate(url: string): void;
  /** `GET <auth>/get-session` with the session cookie. */
  probeSession(): Promise<Response>;
  switchToJwtMode(): Promise<boolean>;
}

/** Configuration of the detector. */
export interface LtSessionLossConfig {
  enabled: boolean;
  loginPath: string;
  publicPaths: readonly string[];
}

/** The detector: `handle(url)` resolves to `true` when the session was found dead and the user was redirected. */
export interface LtSessionLossDetector {
  handle(url?: string): Promise<boolean>;
}

/**
 * Session-loss detection on 401 (port of the nuxt-extensions auth interceptor).
 *
 * A 401 from a domain endpoint is no proof of an expired session (backends mislabel permission errors as 401), so the
 * session endpoint is probed first: only a confirmed dead session (`401`/`403` or an empty body) clears the state and
 * redirects to `loginPath?redirect=<current url>`. A probe without verdict (network error, 429, 5xx) never logs out.
 * The guard is claimed as late as possible and held only after a logout, so a 401 that was ignored (auth endpoint,
 * public page, user not hydrated yet) never swallows the ones right behind it.
 */
export function createLtSessionLossDetector(host: LtSessionLossHost, config: LtSessionLossConfig): LtSessionLossDetector {
  let handling = false;
  let aliveUntil = 0;

  const isPublicRoute = (): boolean => {
    const current = host.currentUrl();
    if (!current) {
      return false;
    }
    const path = ltPathOf(current);
    return config.publicPaths.some((publicPath) => path.startsWith(publicPath));
  };

  const probe = async (): Promise<boolean | null> => {
    if (Date.now() < aliveUntil) {
      return true;
    }
    let verdict: boolean | null;
    try {
      const response = await host.probeSession();
      if (response.status === 401 || response.status === 403) {
        return false;
      }
      if (!response.ok) {
        return null;
      }
      const data = (await response.json().catch(() => null)) as { session?: unknown; user?: unknown } | null;
      verdict = Boolean(data && (data.user || data.session));
      // In JWT mode the 401 came from the bearer while the verdict came from the cookie: the bearer is stale.
      if (verdict && host.isJwtMode()) {
        await host.switchToJwtMode().catch(() => false);
      }
    } catch {
      return null;
    }
    if (verdict) {
      aliveUntil = Date.now() + LT_SESSION_ALIVE_TTL_MS;
    }
    return verdict;
  };

  return {
    async handle(url?: string): Promise<boolean> {
      if (!config.enabled || handling || (url && isLtAuthEndpoint(url)) || isPublicRoute() || !host.isAuthenticated()) {
        return false;
      }
      handling = true;
      let loggedOut = false;
      try {
        const alive = await probe();
        if (alive !== false) {
          return false;
        }
        loggedOut = true;
        host.clearUser();
        const current = host.currentUrl();
        const redirect = current && ltPathOf(current) !== config.loginPath ? `?redirect=${encodeURIComponent(current)}` : '';
        host.navigate(`${config.loginPath}${redirect}`);
        return true;
      } catch (error) {
        console.error('[@lenne.tech/ng-base] Handling a 401 failed:', error);
        return loggedOut;
      } finally {
        if (loggedOut) {
          setTimeout(() => {
            handling = false;
          }, LT_SESSION_LOSS_GUARD_MS);
        } else {
          handling = false;
        }
      }
    },
  };
}
