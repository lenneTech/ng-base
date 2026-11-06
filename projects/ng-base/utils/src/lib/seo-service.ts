import { DOCUMENT } from '@angular/common';
import { inject, Service } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { LT_RUNTIME_CONFIG } from '@lenne.tech/ng-base';

/** SEO data of a page. */
export interface LtSeoData {
  /** Canonical URL (absolute, or a path resolved against `NG_PUBLIC_SITE_URL`). Default: `url`. */
  canonical?: string;
  description?: string;
  /** Social image (absolute URL, or a path resolved against the site URL). */
  image?: string;
  keywords?: string;
  /** Locale for `og:locale`, e.g. `de_DE`. */
  locale?: string;
  /** `false` adds `noindex, nofollow`. Default `true`. */
  index?: boolean;
  /** Site name for `og:site_name`. */
  siteName?: string;
  title: string;
  /** `og:type` (default `website`). */
  type?: string;
  /** Page URL (absolute, or a path resolved against the site URL). Default: the current URL. */
  url?: string;
}

/**
 * Title, description, Open Graph, Twitter and robots meta tags, plus the canonical link (SSR-safe: tags are rendered
 * on the server). Ported from ng-base 18 (`SEOService`, fixed 2026-11-03) and extended by canonical, robots and
 * site-URL resolution.
 */
@Service()
export class LtSeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly runtime = inject(LT_RUNTIME_CONFIG, { optional: true });

  /** Set every tag for a page. Tags of an earlier page that `data` leaves out are removed. */
  set(data: LtSeoData): void {
    const url = this.absolute(data.url) ?? this.currentUrl();
    const image = this.absolute(data.image);
    this.title.setTitle(data.title);
    this.tag('name', 'description', data.description);
    this.tag('name', 'keywords', data.keywords);
    this.tag('name', 'robots', data.index === false ? 'noindex, nofollow' : undefined);
    this.tag('property', 'og:title', data.title);
    this.tag('property', 'og:description', data.description);
    this.tag('property', 'og:type', data.type ?? 'website');
    this.tag('property', 'og:url', url);
    this.tag('property', 'og:image', image);
    this.tag('property', 'og:site_name', data.siteName);
    this.tag('property', 'og:locale', data.locale);
    this.tag('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    this.tag('name', 'twitter:title', data.title);
    this.tag('name', 'twitter:description', data.description);
    this.tag('name', 'twitter:image', image);
    this.setCanonical(this.absolute(data.canonical) ?? url);
  }

  /** Mark the page as not indexable (`noindex, nofollow`). */
  setNoIndex(): void {
    this.tag('name', 'robots', 'noindex, nofollow');
  }

  /** Set or remove `<link rel="canonical">`. */
  setCanonical(url: string | undefined): void {
    const head = this.document.head;
    let link = head?.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? null;
    if (!url) {
      link?.remove();
      return;
    }
    if (!link && head) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link?.setAttribute('href', url);
  }

  private tag(attribute: 'name' | 'property', key: string, content: string | undefined): void {
    if (content) {
      this.meta.updateTag({ [attribute]: key, content });
    } else {
      this.meta.removeTag(`${attribute}="${key}"`);
    }
  }

  private absolute(urlOrPath: string | undefined): string | undefined {
    if (!urlOrPath) {
      return undefined;
    }
    if (/^[a-z][a-z\d+\-.]*:/i.test(urlOrPath)) {
      return urlOrPath;
    }
    const site = (this.runtime?.siteUrl || this.document.location?.origin || '').replace(/\/+$/, '');
    return site ? `${site}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}` : urlOrPath;
  }

  private currentUrl(): string | undefined {
    const location = this.document.location;
    if (!location?.pathname) {
      return undefined;
    }
    return this.absolute(`${location.pathname}${location.search ?? ''}`);
  }
}
