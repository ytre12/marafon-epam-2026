import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideRouter, RouterLink } from '@angular/router';
import { of, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ReservationDashboardComponent } from './reservation-dashboard.component';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { LocationsService } from '@app/services/locations/locations.service';
import { TableService } from '@app/services/table/table.service';
import { TranslatePipe } from '@app/shared/i18n/translate.pipe';
import { ReservationCustomer, ReservationStatusCustomer } from '@app/models/reservations/reservation.model';
import { Roles } from '@app/shared/constants/roles';

describe('Reservation dashboard filters', () => {
  const makeReservation = (id: string, guests: number, status: ReservationStatusCustomer) =>
    ({ id, guestCount: guests, status } as ReservationCustomer);
  const reservations = [
    makeReservation('cancelled-single', 1, ReservationStatusCustomer.Cancelled),
    makeReservation('reserved-group', 2, ReservationStatusCustomer.Reserved),
    makeReservation('reserved-single', 1, ReservationStatusCustomer.Reserved),
    makeReservation('finished-group', 3, ReservationStatusCustomer.Finished),
    makeReservation('progress-group', 4, ReservationStatusCustomer.InProgress),
  ];
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReservationDashboardComponent],
      providers: [provideRouter([]),
        { provide: AuthenticationService, useValue: {
          getToken: () => 'test', getUser: () => ({ id: 'customer', role: Roles.CUSTOMER }),
        } },
        { provide: ReservationService, useValue: { getReservationsForUser$: () => of([]) } },
        { provide: PreOrdersService, useValue: { getPreOrders: () => of([]) } },
        { provide: LocationsService, useValue: {} },
        { provide: TableService, useValue: {} },
      ],
    }).overrideComponent(ReservationDashboardComponent, {
      set: { imports: [TranslatePipe, RouterLink], schemas: [NO_ERRORS_SCHEMA] },
    });
  });

  function setup() {
    const fixture = TestBed.createComponent(ReservationDashboardComponent);
    fixture.detectChanges();
    fixture.componentInstance.reservations.set([...reservations]);
    fixture.detectChanges();
    return fixture;
  }

  it('combines status and type selections from the UI', () => {
    const fixture = setup();
    const status: HTMLSelectElement = fixture.nativeElement.querySelector('#reservation-status');
    const type: HTMLSelectElement = fixture.nativeElement.querySelector('#reservation-type');
    status.value = String(ReservationStatusCustomer.Reserved);
    status.dispatchEvent(new Event('change'));
    type.value = 'group';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleReservations().map(item => item.id)).toEqual(['reserved-group']);
    expect(fixture.nativeElement.querySelector('.result-count').textContent).toContain('1 / 5');
  });

  it('supports each status without mixing up its numeric value', () => {
    const fixture = setup();
    for (const option of fixture.componentInstance.statusOptions) {
      fixture.componentInstance.statusFilter.set(String(option.value));
      expect(fixture.componentInstance.visibleReservations().every(item => item.status === option.value)).toBeTrue();
      expect(fixture.componentInstance.visibleReservations().length).toBeGreaterThan(0);
    }
  });

  it('sorts groups or individuals first without mutating source data', () => {
    const component = setup().componentInstance;
    component.sortOrder.set('group');
    expect(component.visibleReservations().slice(0, 3).every(item => item.guestCount >= 2)).toBeTrue();
    component.sortOrder.set('single');
    expect(component.visibleReservations().slice(0, 2).every(item => item.guestCount === 1)).toBeTrue();
    expect(component.reservations()).toEqual(reservations);
  });

  it('sorts by lifecycle status rather than translated labels', () => {
    const component = setup().componentInstance;
    component.sortOrder.set('status');
    expect(component.visibleReservations().map(item => item.id)).toEqual([
      'reserved-group', 'reserved-single', 'progress-group', 'finished-group', 'cancelled-single',
    ]);
  });

  it('shows no matches and resets both filters and ordering', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    component.statusFilter.set(String(ReservationStatusCustomer.Finished));
    component.typeFilter.set('single');
    component.sortOrder.set('group');
    fixture.detectChanges();
    expect(component.visibleReservations()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.reservation-empty')).not.toBeNull();
    fixture.nativeElement.querySelector('.reservation-filters button').click();
    fixture.detectChanges();
    expect(component.visibleReservations()).toEqual(reservations);
    expect(component.sortOrder()).toBe('default');
  });

  it('updates results when an edited reservation changes its guest count or status', () => {
    const component = setup().componentInstance;
    component.statusFilter.set(String(ReservationStatusCustomer.Reserved));
    component.typeFilter.set('group');
    component.reservations.update(items => items.map(item => item.id === 'reserved-group' ? { ...item, guestCount: 1 } : item));
    expect(component.visibleReservations()).toEqual([]);
  });
  it('limits feedback requests to three, keeps source order and continues after a failed request', () => {
    const pending = reservations.map(() => new Subject<null>());
    const getFeedback = jasmine.createSpy('getReservationFeedback').and.callFake((id: string) =>
      pending[reservations.findIndex(reservation => reservation.id === id)].asObservable());
    TestBed.overrideProvider(ReservationService, { useValue: {
      getReservationsForUser$: () => of(reservations),
      getReservationFeedback: getFeedback,
    } });
    const fixture = TestBed.createComponent(ReservationDashboardComponent);
    fixture.detectChanges();
    expect(getFeedback.calls.count()).toBe(3);
    expect(fixture.componentInstance.reservationsLoaded()).toBeFalse();

    pending[1].next(null);
    pending[1].complete();
    expect(getFeedback.calls.count()).toBe(4);
    pending[2].error(new HttpErrorResponse({ status: 404 }));
    expect(getFeedback.calls.count()).toBe(5);
    for (const index of [4, 3, 0]) {
      pending[index].next(null);
      pending[index].complete();
    }
    expect(fixture.componentInstance.reservations().map(reservation => reservation.id))
      .toEqual(reservations.map(reservation => reservation.id));
    expect(fixture.componentInstance.reservationsLoaded()).toBeTrue();
  });

  it('cancels feedback requests when the page is destroyed without starting queued requests', () => {
    const pending = reservations.map(() => new Subject<null>());
    const getFeedback = jasmine.createSpy('getReservationFeedback').and.callFake((id: string) =>
      pending[reservations.findIndex(reservation => reservation.id === id)].asObservable());
    TestBed.overrideProvider(ReservationService, { useValue: {
      getReservationsForUser$: () => of(reservations), getReservationFeedback: getFeedback,
    } });
    const fixture = TestBed.createComponent(ReservationDashboardComponent);
    fixture.detectChanges();
    fixture.destroy();
    pending[0].next(null);
    pending[0].complete();
    expect(getFeedback.calls.count()).toBe(3);
    expect(pending.every(request => !request.observed)).toBeTrue();
  });

});
