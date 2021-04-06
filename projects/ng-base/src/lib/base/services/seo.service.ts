import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/**
 * SEO service for setting HTML meta data
 */
@Injectable({
  providedIn: 'root',
})
export class SEOService {
  constructor(private titleService: Title, private metaTagService: Meta) {}

  public initPageForSEO(title: string, description: string, keywords?: string) {
    this.setPageTitle(title);
    this.setPageDescription(description);

    if (keywords) {
      this.setPageKeywords(keywords);
    }
  }

  private setPageTitle(title: string) {
    this.titleService.setTitle(title);
    this.metaTagService.updateTag({property: 'og:title', content: title});
    this.metaTagService.updateTag({name: 'twitter:title', content: title});
  }

  private setPageDescription(description: string) {
    this.metaTagService.updateTag({name: 'description', content: description});
    this.metaTagService.updateTag({property: 'og:description', content: description});
    this.metaTagService.updateTag({name: 'twitter:description', content: description});
  }

  private setPageKeywords(keywords: string) {
    this.metaTagService.updateTag({name: 'keywords', content: keywords});
  }
}
