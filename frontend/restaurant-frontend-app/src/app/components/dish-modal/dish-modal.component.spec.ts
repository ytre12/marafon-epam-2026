import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { LanguageService } from '@app/shared/i18n/language.service';
import { DishDetailsButtonComponent } from './dish-details-button.component';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';

describe('Dish details dialog', () => {
  const dish: DishListResponse = {
    id: 'dish/1', name: 'Original dish name', imageUrl: 'assets/img/dish.png',
    price: 12, state: 'Available', weight: '250 g', dishType: 'MainCourse',
    description: '', calories: '', proteins: '', fats: '', carbohydrates: '', vitamins: '',
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DishDetailsButtonComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/test-api' }],
    });
    TestBed.inject(LanguageService).setLanguage('en');
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function open() {
    const fixture = TestBed.createComponent(DishDetailsButtonComponent);
    fixture.componentRef.setInput('dish', dish);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    const request = TestBed.inject(HttpTestingController).expectOne('/test-api/dishes/dish%2F1');
    expect(request.request.method).toBe('GET');
    return { fixture, request };
  }

  it('loads full nutritional data instead of relying on the list summary', () => {
    const { fixture, request } = open();
    expect(fixture.nativeElement.textContent).toContain('Loading dish details...');
    request.flush({ ...dish, description: 'Fresh ingredients', calories: '420 kcal', proteins: '20 g',
      fats: '12 g', carbohydrates: '40 g', vitamins: 'A, C' });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const value of ['Fresh ingredients', '420 kcal', '20 g', '12 g', '40 g', 'A, C']) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain('kcal kcal');
    expect(fixture.nativeElement.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
  });

  it('shows missing values honestly and translates labels only', () => {
    const { fixture, request } = open();
    request.flush(dish);
    TestBed.inject(LanguageService).setLanguage('uk');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Не вказано');
    expect(fixture.nativeElement.textContent).toContain(dish.name);
  });

  it('adds units to numeric values without treating zero as missing', () => {
    const { fixture, request } = open();
    request.flush({ ...dish, calories: '380', proteins: '0', fats: '25 g' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('380 kcal');
    expect(fixture.nativeElement.textContent).toContain('0 g');
    expect(fixture.nativeElement.textContent).not.toContain('25 g g');
  });

  it('keeps loading errors in English', () => {
    const { fixture, request } = open();
    TestBed.inject(LanguageService).setLanguage('uk');
    request.flush({}, { status: 500, statusText: 'Server error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to load dish details.');
  });

  it('closes on Escape and can be reopened', () => {
    const { fixture, request } = open();
    request.flush(dish);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/test-api/dishes/dish%2F1').flush(dish);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    fixture.nativeElement.querySelector('.close-button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not bubble clicks into selection or ordering controls', () => {
    const { fixture, request } = open();
    request.flush(dish);
    const parentClick = jasmine.createSpy('parentClick');
    fixture.nativeElement.parentElement.addEventListener('click', parentClick, { once: true });
    fixture.nativeElement.querySelector('.modal-overlay').click();
    fixture.detectChanges();
    expect(parentClick).not.toHaveBeenCalled();
    fixture.nativeElement.parentElement.removeEventListener('click', parentClick);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
});
