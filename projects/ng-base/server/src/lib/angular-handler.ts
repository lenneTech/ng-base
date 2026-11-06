/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';

import { writeResponseToNodeResponse } from '@angular/ssr/node';
import { injectLtRuntimeConfigScript, type LtRequestContext, type LtRuntimeConfig } from '@lenne.tech/ng-base';

import type { LtNodeMiddleware } from './middlewares';
import { applyLtHtmlCacheHeaders } from './middlewares';
import { readLtRequestContext, type LtEnv, type LtRuntimeEnvOptions } from './runtime-env';

/** The part of `AngularNodeAppEngine` the handler needs. */
export interface LtAngularEngine {
  handle(request: IncomingMessage, requestContext?: unknown): Promise<Response | null>;
}

/** Options of {@link ltAngularRequestHandler}. */
export interface LtAngularRequestHandlerOptions extends LtRuntimeEnvOptions {
  /** Set `Cache-Control: private, no-cache` + `Vary: Cookie` on HTML without own cache header (default `true`). */
  htmlNoCache?: boolean;
  /** Write the pre-hydration submit guard into the HTML (default `true`, see `LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT`). */
  submitGuard?: boolean;
  /** Environment (default `process.env`, read per request). */
  env?: LtEnv;
}

/**
 * Write the public runtime configuration as `<script id="ng-runtime-config">` into an HTML response (SSR and
 * client-rendered routes alike). Non-HTML responses are returned unchanged.
 */
export async function withLtRuntimeConfigScript(response: Response, config: Partial<LtRuntimeConfig>, options: { submitGuard?: boolean } = {}): Promise<Response> {
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
    return response;
  }
  const html = injectLtRuntimeConfigScript(await response.text(), config, options);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { headers, status: response.status, statusText: response.statusText });
}

/**
 * The Angular render handler for `server.ts`: per request it reads the `NG_*` environment into an
 * {@link LtRequestContext}, renders with `engine.handle(req, context)`, adds the HTML cache headers and the runtime
 * config script, and writes the response. Unhandled requests go to `next()`.
 *
 * @example server.ts
 * app.use(ltAngularRequestHandler(new AngularNodeAppEngine(), { appVersion: packageJson.version }));
 */
export function ltAngularRequestHandler(engine: LtAngularEngine, options: LtAngularRequestHandlerOptions = {}): LtNodeMiddleware {
  return (req: IncomingMessage, res: ServerResponse, next) => {
    const context: LtRequestContext = readLtRequestContext(options.env, options);
    engine
      .handle(req, context)
      .then(async (response) => {
        if (!response) {
          next();
          return;
        }
        if (options.htmlNoCache !== false) {
          applyLtHtmlCacheHeaders(response);
        }
        await writeResponseToNodeResponse(await withLtRuntimeConfigScript(response, context.runtimeConfig, { submitGuard: options.submitGuard }), res);
      })
      .catch(next);
  };
}
