import { ReservationService } from '@app/services/reservation/reservation.service';
import { throwError } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { Order } from '@app/models/orders/order.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';

import { CartComponent } from './cart.component';

describe('CartComponent', () => {
  let component: CartComponent;
  let fixture: ComponentFixture<CartComponent>;

  let preOrdersServiceMock: jasmine.SpyObj<PreOrdersService>;
  let reservationsMock: jasmine.SpyObj<ReservationService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    reservationsMock = jasmine.createSpyObj<ReservationService>('ReservationService', ['getReservationsForUser$', 'getReservationById']);
    reservationsMock.getReservationsForUser$.and.returnValue(of([]));
    reservationsMock.getReservationById.and.returnValue(of({ guestCount: 1 } as import('@app/models/reservations/reservation.model').ReservationCustomer));
    preOrdersServiceMock =
      jasmine.createSpyObj<PreOrdersService>(
        'PreOrdersService',
        [
          'getPreOrders',
          'cancelPreOrderByReservationId',
          'unsubmitPreOrderByReservationId',
          'submitPreOrderByReservationId',
          'editPreOrderByReservationId',
        ],
      );

    routerMock = jasmine.createSpyObj<Router>(
      'Router',
      ['navigate'],
    );

    preOrdersServiceMock.getPreOrders.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [
        { provide: ReservationService, useValue: reservationsMock },
        {
          provide: PreOrdersService,
          useValue: preOrdersServiceMock,
        },
        {
          provide: Router,
          useValue: routerMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CartComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('shows the cart without a separate group reservations section or request', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.group-reservations')).toBeNull();
    expect(reservationsMock.getReservationsForUser$).not.toHaveBeenCalled();
  });

  it('should emit closeCartEvent when closeCart is called', () => {
    spyOn(component.closeCartEvent, 'emit');

    component.closeCart();

    expect(
      component.closeCartEvent.emit,
    ).toHaveBeenCalled();
  });

  it('should return submitted orders with statuses 1 and 3', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 1,
      },
      {
        orderId: 'order-2',
        status: 2,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
      {
        orderId: 'order-4',
        status: 0,
      },
    ] as Order[]);

    expect(
      component
        .submittedOrders()
        .map((order) => order.status),
    ).toEqual([1, 3]);
  });

  it('should return unsubmitted orders with status 0', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 0,
      },
      {
        orderId: 'order-2',
        status: 1,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
    ] as Order[]);

    expect(
      component
        .unsubmittedOrders()
        .map((order) => order.status),
    ).toEqual([0]);
  });

  it('should navigate to reservations when goToReservations is called', () => {
    component.goToReservations();

    expect(routerMock.navigate).toHaveBeenCalledWith([
      '/reservations',
    ]);
  });
  it('opens the selected reservation menu and closes the cart when Add dish is clicked', () => {
    const orders: Order[] = ['first', 'second'].map((name) => ({
      orderId: `order-${name}`,
      reservationId: `reservation-${name}`,
      reservationAddress: `Address ${name}`,
      reservationTime: '18:00 - 19:30',
      orderItems: [],
      status: 0,
    }));
    component.orders.set(orders);
    fixture.detectChanges();
    const closeSpy = spyOn(component.closeCartEvent, 'emit');
    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.add-dish-btn');

    buttons[1].click();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/menu'], {
      queryParams: {
        preOrder: 'true',
        reservationId: 'reservation-second',
        reservationLabel: 'Address second, 18:00 - 19:30',
      },
    });
    expect(component.orders()).toEqual(orders);
  });

  it('does not open an unrelated menu for an unknown order', () => {
    const closeSpy = spyOn(component.closeCartEvent, 'emit');
    component.addDishToOrder('missing-order');
    expect(routerMock.navigate).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('does not navigate when the reservation ID is missing', () => {
    component.orders.set([{
      orderId: 'order-1', reservationId: '', reservationAddress: '',
      reservationTime: '', orderItems: [], status: 0,
    }]);
    component.addDishToOrder('order-1');
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('opens the group page instead of the individual menu for a group reservation', () => {
    const order: Order = { orderId: 'order', reservationId: 'group-reservation', reservationAddress: '',
      reservationTime: '', orderItems: [], status: 0 };
    component.orders.set([order]);
    reservationsMock.getReservationById.and.returnValue(of({ guestCount: 2 } as import('@app/models/reservations/reservation.model').ReservationCustomer));
    const closeSpy = spyOn(component.closeCartEvent, 'emit');
    component.addDishToOrder('order');
    expect(reservationsMock.getReservationById).toHaveBeenCalledWith('group-reservation');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/reservations', 'group-reservation', 'group-order']);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(component.openingMenu()).toBeFalse();
  });

  it('keeps the cart open if reservation lookup fails instead of guessing the order type', () => {
    component.orders.set([{ orderId: 'order', reservationId: 'reservation', reservationAddress: '',
      reservationTime: '', orderItems: [], status: 0 }]);
    reservationsMock.getReservationById.and.returnValue(throwError(() => new Error('Offline')));
    const closeSpy = spyOn(component.closeCartEvent, 'emit');
    component.addDishToOrder('order');
    expect(routerMock.navigate).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(component.menuNavigationError()).toContain('Unable to load reservation details');
    expect(component.openingMenu()).toBeFalse();
  });

});
