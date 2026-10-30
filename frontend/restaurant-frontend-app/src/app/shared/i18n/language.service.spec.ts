import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';
import { UK_TRANSLATIONS } from './uk';

describe('LanguageService', () => {
  let saved: string | null;
  let storage: { getItem: jasmine.Spy; setItem: jasmine.Spy };
  let documentStub: {
    documentElement: { lang: string };
    defaultView: { localStorage: typeof storage };
  };
  beforeEach(() => {
    saved = null;
    storage = {
      getItem: jasmine.createSpy('getItem').and.callFake(() => saved),
      setItem: jasmine
        .createSpy('setItem')
        .and.callFake((_key: string, value: string) => (saved = value)),
    };
    documentStub = { documentElement: { lang: 'en' }, defaultView: { localStorage: storage } };
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: documentStub }] });
  });
  it('defaults to English and leaves English text unchanged', () => {
    const service = TestBed.inject(LanguageService);
    expect(service.language()).toBe('en');
    expect(service.translate('Menu')).toBe('Menu');
  });
  it('restores the saved Ukrainian preference', () => {
    saved = 'uk';
    const service = TestBed.inject(LanguageService);
    expect(service.translate('Menu')).toBe('Меню');
    expect(documentStub.documentElement.lang).toBe('uk');
  });
  it('switches both ways and persists the preference', () => {
    const service = TestBed.inject(LanguageService);
    service.setLanguage('uk');
    expect(service.translate('Book a Table')).toBe('Забронювати столик');
    expect(storage.setItem).toHaveBeenCalledWith('restaurant.interface-language', 'uk');
    service.setLanguage('en');
    expect(service.translate('Book a Table')).toBe('Book a Table');
    expect(documentStub.documentElement.lang).toBe('en');
  });
  it('ignores an unsupported saved language', () => {
    saved = 'de';
    expect(TestBed.inject(LanguageService).language()).toBe('en');
  });
  it('works when storage access is blocked', () => {
    storage.getItem.and.throwError('Blocked');
    storage.setItem.and.throwError('Blocked');
    const service = TestBed.inject(LanguageService);
    service.setLanguage('uk');
    expect(service.translate('Menu')).toBe('Меню');
  });
  it('preserves unknown text and safely handles null', () => {
    const service = TestBed.inject(LanguageService);
    service.setLanguage('uk');
    expect(service.translate('Server unavailable')).toBe('Server unavailable');
    expect(service.translate(null)).toBe('');
  });
  it('keeps error messages outside the interface catalogue', () => {
    for (const message of [
      'First name is required.',
      'Password must be 8–16 characters long',
      'Invalid email or password.',
      'Link is unavailable',
      'Unable to update the group. Refresh and try again.',
    ]) {
      expect(UK_TRANSLATIONS[message]).withContext(message).toBeUndefined();
    }
  });
});
