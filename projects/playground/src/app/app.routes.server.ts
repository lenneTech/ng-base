import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * Every route is server-rendered, as in the Nuxt starter (auth pages included): the response carries the runtime config
 * of the stage it runs on and the signed-in shell is rendered from the auth-state cookie. Nothing is prerendered.
 */
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
