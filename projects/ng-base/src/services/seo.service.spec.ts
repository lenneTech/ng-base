import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { SEOService } from './seo.service';

/**
 * Checks the meta data on every platform: crawlers for link previews (Facebook, WhatsApp, LinkedIn, X) read the
 * HTML rendered by the server and run no JavaScript, so the server must set the same tags as the browser. The page
 * URL comes from the document, which exists on the server, while window does not.
 */
describe('SEOService', () => {
  const data = { title: 'Title', description: 'Description', keywords: 'a, b' };
  let meta: Meta;

  /**
   * Creates the service with its own document whose location is the given URL (null: no location)
   */
  function setup(platform: 'browser' | 'server', href: string | null = 'https://example.org/page'): SEOService {
    // location of a document cannot be redefined, so a proxy answers it and passes everything else to the document
    const target = window.document.implementation.createHTMLDocument('test');
    const document = new Proxy(target, {
      get: (doc, prop) => {
        if (prop === 'location') {
          return href ? { href } : null;
        }
        const value = Reflect.get(doc, prop, doc);
        return typeof value === 'function' ? value.bind(doc) : value;
      },
      set: (doc, prop, value) => Reflect.set(doc, prop, value, doc),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: document },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    meta = TestBed.inject(Meta);
    return TestBed.inject(SEOService);
  }

  const content = (selector: string) => meta.getTag(selector)?.content;

  for (const platform of ['server', 'browser'] as const) {
    it(`sets the social meta tags with the URL of the document (${platform})`, () => {
      setup(platform).initPageForSEO(data);

      expect(TestBed.inject(Title).getTitle()).toBe('Title');
      expect(content("name='description'")).toBe('Description');
      expect(content("name='keywords'")).toBe('a, b');
      expect(content("name='twitter:title'")).toBe('Title');
      expect(content("name='twitter:description'")).toBe('Description');
      expect(content("property='twitter:url'")).toBe('https://example.org/page');
      expect(content("property='og:title'")).toBe('Title');
      expect(content("property='og:description'")).toBe('Description');
      expect(content("property='og:type'")).toBe('website');
      expect(content("property='og:url'")).toBe('https://example.org/page');
    });
  }

  it('prefers the given URL and sets the image', () => {
    setup('server').initPageForSEO({ ...data, url: 'https://example.org/', image: 'https://example.org/preview.png' });

    expect(content("property='og:url'")).toBe('https://example.org/');
    expect(content("property='twitter:url'")).toBe('https://example.org/');
    expect(content("property='og:image'")).toBe('https://example.org/preview.png');
    expect(content("property='twitter:image'")).toBe('https://example.org/preview.png');
    expect(content("property='twitter:card'")).toBe('summary_large_image');
  });

  it('leaves out the URL when neither a URL is given nor the document has one', () => {
    const service = setup('server', null);

    expect(() => service.initPageForSEO(data)).not.toThrow();
    expect(content("property='og:title'")).toBe('Title');
    expect(meta.getTag("property='og:url'")).toBeNull();
    expect(meta.getTag("property='twitter:url'")).toBeNull();
  });
});
