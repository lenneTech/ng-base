import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { isPlatformBrowser } from '@angular/common';

interface SEOData {
  title: string;
  description: string;
  image?: string;
  url?: string;
  keywords?: string;
}

/**
 * SEO service for setting HTML meta data
 */
@Injectable({
  providedIn: 'root',
})
export class SEOService {
  constructor(
    private titleService: Title,
    private metaTagService: Meta,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  public initPageForSEO(input: SEOData) {
    this.setGeneralData(input);
    this.setTwitterData(input);
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
    if (isPlatformBrowser(this.platformId)) {
      this.metaTagService.updateTag({ name: 'twitter:title', content: data.title });
      this.metaTagService.updateTag({ name: 'twitter:description', content: data.description });
      this.metaTagService.updateTag({
        property: 'twitter:url',
        content: data.url ? data.url : window?.location.href,
      });
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
    if (isPlatformBrowser(this.platformId)) {
      this.metaTagService.updateTag({ property: 'og:title', content: data.title });
      this.metaTagService.updateTag({ property: 'og:description', content: data.description });
      this.metaTagService.updateTag({
        property: 'og:type',
        content: 'website',
      });
      this.metaTagService.updateTag({
        property: 'og:url',
        content: data.url ? data.url : window?.location.href,
      });
    }
    if (data.image) {
      this.metaTagService.updateTag({
        property: 'og:image',
        content: data.image,
      });
    }
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
