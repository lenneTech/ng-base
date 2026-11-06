import {
  allowedRequestOrigin,
  buildSecurityTxt,
  normalizeSecurityTxtContacts,
  normalizeSecurityTxtList,
  normalizeSecurityTxtValidDays,
  resolveSecurityTxt,
  SECURITY_TXT_DEFAULT_CONTACT,
  SECURITY_TXT_DEFAULT_LANGUAGES,
  SECURITY_TXT_DEFAULT_VALID_DAYS,
  SECURITY_TXT_PATH,
  toSecurityTxtOrigin,
} from './security-txt';

const NOW = new Date('2026-11-06T19:10:00.000Z');

describe('security.txt defaults', () => {
  it('match RFC 9116 and the lenne.Tech website', () => {
    expect(SECURITY_TXT_PATH).toBe('/.well-known/security.txt');
    expect(SECURITY_TXT_DEFAULT_CONTACT).toBe('mailto:security@lenne.tech');
    expect(SECURITY_TXT_DEFAULT_LANGUAGES).toEqual(['de', 'en']);
    expect(SECURITY_TXT_DEFAULT_VALID_DAYS).toBe(180);
  });
});

describe('normalizeSecurityTxtContacts()', () => {
  it('accepts mailto:, tel: and https:// URIs, as string or array, trimmed and case-insensitive', () => {
    expect(normalizeSecurityTxtContacts('mailto:security@customer.example')).toEqual(['mailto:security@customer.example']);
    expect(normalizeSecurityTxtContacts(['  https://customer.example/security  ', 'tel:+49-123', 'MAILTO:SEC@CUSTOMER.EXAMPLE'])).toEqual([
      'https://customer.example/security',
      'tel:+49-123',
      'MAILTO:SEC@CUSTOMER.EXAMPLE',
    ]);
  });

  it('drops what is not a usable URI', () => {
    expect(normalizeSecurityTxtContacts('security@customer.example')).toEqual([]);
    expect(normalizeSecurityTxtContacts('http://customer.example/security')).toEqual([]);
    expect(normalizeSecurityTxtContacts('mailto:')).toEqual([]);
    expect(normalizeSecurityTxtContacts(['', '   ', 42, null, undefined, { a: 1 }])).toEqual([]);
    expect(normalizeSecurityTxtContacts(undefined)).toEqual([]);
  });

  it('drops values with whitespace or line breaks (they would forge an additional field)', () => {
    expect(normalizeSecurityTxtContacts(['mailto:a@customer.example\nPolicy: https://evil.example', 'mailto:a b@customer.example', 'mailto:ok@customer.example'])).toEqual([
      'mailto:ok@customer.example',
    ]);
  });
});

describe('normalizeSecurityTxtList()', () => {
  it('accepts a comma-separated string (env override) or an array', () => {
    expect(normalizeSecurityTxtList('de, en')).toEqual(['de', 'en']);
    expect(normalizeSecurityTxtList('de,,en,')).toEqual(['de', 'en']);
    expect(normalizeSecurityTxtList([' www.customer.example ', 'alt.customer.example'])).toEqual(['www.customer.example', 'alt.customer.example']);
  });

  it('drops non-strings and entries with whitespace inside, anything else yields []', () => {
    expect(normalizeSecurityTxtList(['de', 1, null, 'en us', 'fr\nContact: x'])).toEqual(['de']);
    expect(normalizeSecurityTxtList(undefined)).toEqual([]);
    expect(normalizeSecurityTxtList(42)).toEqual([]);
    expect(normalizeSecurityTxtList({ de: true })).toEqual([]);
  });
});

describe('normalizeSecurityTxtValidDays()', () => {
  it('accepts positive numbers and numeric strings, floored', () => {
    expect(normalizeSecurityTxtValidDays(30)).toBe(30);
    expect(normalizeSecurityTxtValidDays('30')).toBe(30);
    expect(normalizeSecurityTxtValidDays(1.9)).toBe(1);
    expect(normalizeSecurityTxtValidDays(1)).toBe(1);
  });

  it('clamps to 365 days (RFC 9116: less than a year)', () => {
    expect(normalizeSecurityTxtValidDays(365)).toBe(365);
    expect(normalizeSecurityTxtValidDays(1000)).toBe(365);
    expect(normalizeSecurityTxtValidDays('9999')).toBe(365);
  });

  it('falls back to the default for non-finite or non-positive values', () => {
    for (const value of [0, 0.5, -5, Number.NaN, Number.POSITIVE_INFINITY, 'abc', '', undefined, null, {}]) {
      expect(normalizeSecurityTxtValidDays(value)).toBe(SECURITY_TXT_DEFAULT_VALID_DAYS);
    }
  });
});

describe('toSecurityTxtOrigin()', () => {
  it('reduces an absolute http(s) URL to its origin', () => {
    expect(toSecurityTxtOrigin('https://customer.example/path/?x=1#top')).toBe('https://customer.example');
    expect(toSecurityTxtOrigin('https://customer.example/')).toBe('https://customer.example');
    expect(toSecurityTxtOrigin('http://localhost:3001')).toBe('http://localhost:3001');
  });

  it('yields undefined for anything else', () => {
    for (const value of [undefined, '', 'customer.example', '/relative', 'ftp://customer.example', 'javascript:alert(1)', 'not a url']) {
      expect(toSecurityTxtOrigin(value)).toBeUndefined();
    }
  });
});

describe('allowedRequestOrigin()', () => {
  it('turns an allowed host into an https origin (case-insensitive, trimmed)', () => {
    expect(allowedRequestOrigin('WWW.Customer.Example', [' www.customer.example '])).toBe('https://www.customer.example');
    expect(allowedRequestOrigin(' alt.customer.example ', ['www.customer.example', 'alt.customer.example'])).toBe('https://alt.customer.example');
  });

  it('rejects hosts that are not listed (the host comes from a request header)', () => {
    expect(allowedRequestOrigin('evil.example', ['www.customer.example'])).toBeUndefined();
    expect(allowedRequestOrigin('www.customer.example:8443', ['www.customer.example'])).toBeUndefined();
    expect(allowedRequestOrigin('www.customer.example', [])).toBeUndefined();
    expect(allowedRequestOrigin(undefined, ['www.customer.example'])).toBeUndefined();
    expect(allowedRequestOrigin('', [''])).toBeUndefined();
  });
});

describe('buildSecurityTxt()', () => {
  it('writes Contact, Expires, Policy, Preferred-Languages and Canonical lines in this order, ending with a newline', () => {
    expect(
      buildSecurityTxt({
        contacts: ['mailto:security@customer.example', 'https://customer.example/security'],
        now: NOW,
        origins: ['https://customer.example', 'https://www.customer.example'],
        policy: 'https://customer.example/policy',
        preferredLanguages: ['de', 'en'],
        validDays: 180,
      }),
    ).toBe(
      [
        'Contact: mailto:security@customer.example',
        'Contact: https://customer.example/security',
        'Expires: 2027-05-05T00:00:00.000Z',
        'Policy: https://customer.example/policy',
        'Preferred-Languages: de, en',
        'Canonical: https://customer.example/.well-known/security.txt',
        'Canonical: https://www.customer.example/.well-known/security.txt',
        '',
      ].join('\n'),
    );
  });

  it('leaves out optional lines that are not configured', () => {
    expect(buildSecurityTxt({ contacts: ['mailto:security@customer.example'], now: NOW, origins: [] })).toBe(
      'Contact: mailto:security@customer.example\nExpires: 2027-05-05T00:00:00.000Z\n',
    );
  });

  describe('Expires', () => {
    it('is validDays after now, cut to midnight UTC', () => {
      const expires = (now: Date, validDays?: number) => /Expires: (.*)/.exec(buildSecurityTxt({ contacts: ['tel:1'], now, origins: [], validDays }))?.[1];
      expect(expires(NOW)).toBe('2027-05-05T00:00:00.000Z');
      expect(expires(NOW, 30)).toBe('2026-12-06T00:00:00.000Z');
      expect(expires(NOW, 365)).toBe('2027-11-06T00:00:00.000Z');
      expect(expires(NOW, 9999)).toBe('2027-11-06T00:00:00.000Z');
      expect(expires(NOW, 0)).toBe('2027-05-05T00:00:00.000Z');
      expect(expires(new Date('2026-11-06T00:00:00.000Z'), 1)).toBe('2026-11-07T00:00:00.000Z');
      expect(expires(new Date('2026-11-06T23:59:59.999Z'), 1)).toBe('2026-11-07T00:00:00.000Z');
    });

    it('is always in the future and at most validDays ahead', () => {
      for (const iso of ['2026-11-06T00:00:00.000Z', '2026-11-06T12:00:00.000Z', '2026-11-06T23:59:59.999Z']) {
        const now = new Date(iso);
        const expires = new Date(/Expires: (.*)/.exec(buildSecurityTxt({ contacts: ['tel:1'], now, origins: [], validDays: 1 }))?.[1] ?? '');
        expect(expires.getTime()).toBeGreaterThan(now.getTime());
        expect(expires.getTime() - now.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      }
    });

    it('keeps the file byte-identical for a whole day', () => {
      const build = (iso: string) => buildSecurityTxt({ contacts: ['mailto:security@customer.example'], now: new Date(iso), origins: ['https://customer.example'] });
      expect(build('2026-11-06T00:00:01.000Z')).toBe(build('2026-11-06T23:59:59.000Z'));
      expect(build('2026-11-06T23:59:59.000Z')).not.toBe(build('2026-11-07T00:00:00.000Z'));
    });
  });

  it('deduplicates origins and strips trailing slashes', () => {
    const text = buildSecurityTxt({ contacts: ['tel:1'], now: NOW, origins: ['https://customer.example/', 'https://customer.example', ''] });
    expect(text.match(/^Canonical: .*$/gm)).toEqual(['Canonical: https://customer.example/.well-known/security.txt']);
  });

  it('resolves a policy path against the first origin, passes absolute URIs through, drops a path without origin', () => {
    const policy = (value: string, origins: string[]) => /Policy: (.*)/.exec(buildSecurityTxt({ contacts: ['tel:1'], now: NOW, origins, policy: value }))?.[1];
    expect(policy('/security-policy', ['https://customer.example', 'https://www.customer.example'])).toBe('https://customer.example/security-policy');
    expect(policy('https://policies.example/disclosure', [])).toBe('https://policies.example/disclosure');
    expect(policy('/security-policy', [])).toBeUndefined();
  });

  it('drops contacts, policy and languages that contain whitespace', () => {
    const text = buildSecurityTxt({
      contacts: ['mailto:ok@customer.example', 'mailto:x@customer.example\nPolicy: https://evil.example'],
      now: NOW,
      origins: [],
      policy: 'https://customer.example/policy\nContact: mailto:evil@evil.example',
      preferredLanguages: ['de', ' en ', 'fr\nContact: x'],
    });
    expect(text).toBe('Contact: mailto:ok@customer.example\nExpires: 2027-05-05T00:00:00.000Z\nPreferred-Languages: de, en\n');
  });
});

describe('resolveSecurityTxt()', () => {
  it('returns undefined without a usable contact (the route answers 404)', () => {
    expect(resolveSecurityTxt({ config: undefined, now: NOW, requestHost: undefined, siteUrl: 'https://customer.example' })).toBeUndefined();
    expect(resolveSecurityTxt({ config: { contact: 'security@customer.example' }, now: NOW, requestHost: undefined, siteUrl: undefined })).toBeUndefined();
    expect(resolveSecurityTxt({ config: { contact: [] }, now: NOW, requestHost: undefined, siteUrl: undefined })).toBeUndefined();
  });

  it('accepts the plain-string values an env override delivers', () => {
    expect(
      resolveSecurityTxt({
        config: {
          contact: 'mailto:security@customer.example',
          hosts: 'www.customer.example, alt.customer.example',
          policy: '/policy',
          preferredLanguages: 'en, de',
          validDays: '30',
        },
        now: NOW,
        requestHost: 'alt.customer.example',
        siteUrl: 'https://customer.example/app',
      }),
    ).toBe(
      [
        'Contact: mailto:security@customer.example',
        'Expires: 2026-12-06T00:00:00.000Z',
        'Policy: https://customer.example/policy',
        'Preferred-Languages: en, de',
        'Canonical: https://customer.example/.well-known/security.txt',
        'Canonical: https://alt.customer.example/.well-known/security.txt',
        '',
      ].join('\n'),
    );
  });

  it('uses the default validity for an unusable validDays', () => {
    expect(resolveSecurityTxt({ config: { contact: 'tel:1', validDays: 'abc' }, now: NOW, requestHost: undefined, siteUrl: undefined })).toContain(
      'Expires: 2027-05-05T00:00:00.000Z',
    );
  });

  it('adds the request host only when it is a configured host, never twice', () => {
    const canonicals = (requestHost: string | undefined, hosts?: string[]) =>
      resolveSecurityTxt({ config: { contact: 'tel:1', hosts }, now: NOW, requestHost, siteUrl: 'https://customer.example' })?.match(/^Canonical: .*$/gm);
    expect(canonicals('evil.example', ['www.customer.example'])).toEqual(['Canonical: https://customer.example/.well-known/security.txt']);
    expect(canonicals('www.customer.example')).toEqual(['Canonical: https://customer.example/.well-known/security.txt']);
    expect(canonicals('customer.example', ['customer.example'])).toEqual(['Canonical: https://customer.example/.well-known/security.txt']);
    expect(canonicals('www.customer.example', ['www.customer.example'])).toHaveLength(2);
  });

  it('works with the request host alone when no site URL is configured', () => {
    const text = resolveSecurityTxt({
      config: { contact: 'tel:1', hosts: ['www.customer.example'], policy: '/policy' },
      now: NOW,
      requestHost: 'www.customer.example',
      siteUrl: 'not a url',
    });
    expect(text).toContain('Policy: https://www.customer.example/policy\n');
    expect(text?.match(/^Canonical: .*$/gm)).toEqual(['Canonical: https://www.customer.example/.well-known/security.txt']);
  });
});
