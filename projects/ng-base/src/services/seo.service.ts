import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

interface SEOData {
  title: string;
  description: string;
  image?: string;
  url?: string;
  keywords?: string;
}

/**
 * SEO service for setting HTML meta data
 *
 * Sets the same tags in the browser and during server-side rendering: crawlers for link previews read the HTML of
 * the server and run no JavaScript. The page URL is taken from the document, which also exists on the server
 * (window does not); pass `url` to set a canonical URL instead, e.g. when the server sits behind a proxy.
 */
@Injectable({
  providedIn: 'root',
})
export class SEOService {
  constructor(
    private titleService: Title,
    private metaTagService: Meta,
    @Inject(DOCUMENT) private document: Document,
  ) {}

  public initPageForSEO(input: SEOData) {
    this.setGeneralData(input);
    this.setTwitterData(input);
    this.setFacebookData(input);

    if (input.keywords) {
      this.setPageKeywords(input.keywords);
    }
  }

  /**
   * Set general metadata
   *
   * @param data
   * @private
   */
  private setGeneralData(data: SEOData) {
    this.titleService.setTitle(data.title);
    this.metaTagService.updateTag({ name: 'description', content: data.description });
  }

  /**
   * Set metadata for twitter
   *
   * @param data
   * @private
   */
  private setTwitterData(data: SEOData) {
    this.metaTagService.updateTag({ name: 'twitter:title', content: data.title });
    this.metaTagService.updateTag({ name: 'twitter:description', content: data.description });
    const url = this.getUrl(data);
    if (url) {
      this.metaTagService.updateTag({ property: 'twitter:url', content: url });
    }

    if (data.image) {
      this.metaTagService.updateTag({
        property: 'twitter:image',
        content: data.image,
      });

      this.metaTagService.updateTag({
        property: 'twitter:card',
        content: 'summary_large_image',
      });
    }
  }

  /**
   * Set metadata for facebook
   *
   * @param data
   * @private
   */
  private setFacebookData(data: SEOData) {
    this.metaTagService.updateTag({ property: 'og:title', content: data.title });
    this.metaTagService.updateTag({ property: 'og:description', content: data.description });
    this.metaTagService.updateTag({
      property: 'og:type',
      content: 'website',
    });
    const url = this.getUrl(data);
    if (url) {
      this.metaTagService.updateTag({ property: 'og:url', content: url });
    }

    if (data.image) {
      this.metaTagService.updateTag({
        property: 'og:image',
        content: data.image,
      });
    }
  }

  /**
   * URL of the page: the given one, otherwise the one of the document (none if neither exists)
   *
   * @param data
   * @private
   */
  private getUrl(data: SEOData): string | undefined {
    return data.url || this.document?.location?.href || undefined;
  }

  /**
   * Set page keywords
   *
   * @param keywords
   * @private
   */
  private setPageKeywords(keywords: string) {
    this.metaTagService.updateTag({ name: 'keywords', content: keywords });
  }
}
