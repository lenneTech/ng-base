import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule } from '@angular/ssr/node';
import { ltBugReport } from '@lenne.tech/ng-base/bug/server';
import { ltAngularRequestHandler, ltApiProxy, ltBuildIdentity, ltSecurityHeaders, ltSecurityTxt } from '@lenne.tech/ng-base/server';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();

app.disable('x-powered-by');
app.use(ltSecurityHeaders());
app.use(ltSecurityTxt());
app.use(ltBuildIdentity());
// POST /_bug-lt/report → Linear (NG_LINEAR_*); 404 in production and without NG_PUBLIC_APP_ENV. No express.json() before it.
app.use(ltBugReport());
app.use(ltApiProxy());
app.use(express.static(browserDistFolder, { index: false, maxAge: '1y', redirect: false }));
app.use(ltAngularRequestHandler(new AngularNodeAppEngine()));

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] || 3001);
  const host = process.env['HOST'] || 'localhost';
  app.listen(port, host, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Playground SSR server listening on http://${host}:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
