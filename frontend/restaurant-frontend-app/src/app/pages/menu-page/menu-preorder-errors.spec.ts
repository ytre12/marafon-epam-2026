import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { throwError } from 'rxjs';
import { MenuPageComponent } from './menu-page.component';
import { DishesService } from '@app/services/dishes/dishes.service';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';

describe('Menu preorder errors', () => {
  for (const message of [
    "Use the group pre-order page to manage this reservation's dishes.",
    'Pre-orders can only be modified up to 30 minutes before the reservation start time (19:00).',
    'One or more dishes in the request are invalid, unavailable, or have a quantity of 0.',
  ]) {
    it(`preserves the server error and routes appropriately: ${message}`, () => {
      const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
      const toast = jasmine.createSpyObj<ToastService>('ToastService', ['error', 'success']);
      TestBed.configureTestingModule({
        imports: [MenuPageComponent],
        providers: [
          { provide: Router, useValue: router },
          { provide: ActivatedRoute, useValue: {} },
          { provide: DishesService, useValue: {} },
          { provide: ToastService, useValue: toast },
          { provide: PreOrdersService, useValue: {
            addDishToPreOrderByReservationId: () => throwError(() => new HttpErrorResponse({
              status: 400, error: { error: message },
            })),
          } },
        ],
      }).overrideComponent(MenuPageComponent, { set: { providers: [] } });
      const component = TestBed.createComponent(MenuPageComponent).componentInstance;
      component.preOrderReservationId = 'reservation';
      component.addDishToCart({ id: 'dish' } as DishListResponse);
      expect(toast.error).not.toHaveBeenCalled();
      if (message.startsWith('Use the group')) {
        expect(router.navigate).toHaveBeenCalledWith(['/reservations', 'reservation', 'group-order']);
      } else {
        expect(router.navigate).not.toHaveBeenCalled();
      }
    });
  }
});
