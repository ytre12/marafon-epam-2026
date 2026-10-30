import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GroupOrderService } from './group-order.service';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { tokenInterceptor } from '@app/auth/token.interceptor';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { ToastService } from '../toast/toast.service';
import { GuestSessionsService } from '../guest-sessions/guest-sessions.service';

describe('GroupOrderService with authentication', () => {
  let api: GroupOrderService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([tokenInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://test.api' },
        {
          provide: AuthenticationService,
          useValue: { getTokens: () => ({ idToken: 'owner-token' }) },
        },
        { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
      ],
    });
    api = TestBed.inject(GroupOrderService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('uses Cognito token for owner-only guest group routes', () => {
    api.sessions('g').subscribe();
    const request = http.expectOne('https://test.api/guest/groups/g/sessions');
    expect(request.request.headers.get('Authorization')).toBe('Bearer owner-token');
    request.flush({ participants: [], total: 0 });
  });
  it('authenticates guest removal and returns updated totals', () => {
    let total = -1;
    api.remove('g', 'guest').subscribe((value) => (total = value.total));
    const request = http.expectOne('https://test.api/guest/groups/g/sessions/guest');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.get('Authorization')).toBe('Bearer owner-token');
    request.flush({ participants: [], total: 0 });
    expect(total).toBe(0);
  });
  it('does not overwrite a guest session bearer token', () => {
    TestBed.inject(GuestSessionsService).addDish('guest', 'guest-secret', 'dish', 1).subscribe();
    const request = http.expectOne('https://test.api/guest/sessions/guest/dishes');
    expect(request.request.headers.get('Authorization')).toBe('Bearer guest-secret');
    request.flush({});
  });
  it('submits the reservation id with the group id', () => {
    api.submit('g', 'r').subscribe();
    const request = http.expectOne('https://test.api/group-reservations/g/submit');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reservationId: 'r' });
    request.flush({});
  });
  it('sends quantity with DELETE for owner cart removal', () => {
    api.changeDish('r', 'dish', false).subscribe();
    const request = http.expectOne('https://test.api/reservations/r/owner-session/dishes');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ dishId: 'dish', quantity: 1 });
    request.flush({});
  });
  it('encodes reservation ids', () => {
    api.owner('a/b c').subscribe();
    http.expectOne('https://test.api/reservations/a%2Fb%20c/guest-session-id').flush({});
  });
});
