import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GroupOrderPageComponent } from './group-order-page.component';
import { GroupOrderService } from '@app/services/group-order/group-order.service';
import {
  GroupParticipant,
  GroupSnapshot,
  OwnerSession,
} from '@app/models/group-order/group-order.model';

const participant = (id: string, submitted: boolean, total: number): GroupParticipant => ({
  id,
  type: id === 'owner' ? 'Owner' : 'Guest',
  name: id,
  isSubmitted: submitted,
  total,
  items: [{ dish: { id: 'dish', name: 'Dish', price: total }, quantity: 1 }],
});

describe('GroupOrderPageComponent', () => {
  let api: jasmine.SpyObj<GroupOrderService>;
  let owner: OwnerSession;
  let snapshot: GroupSnapshot;
  beforeEach(() => {
    owner = {
      guestSessionId: 'owner',
      groupReservationId: 'g',
      status: 'Open',
      canEdit: true,
      inviteToken: 'invite',
    };
    snapshot = {
      participants: [participant('owner', false, 10), participant('guest', true, 20)],
      total: 30,
    };
    api = jasmine.createSpyObj<GroupOrderService>('api', [
      'owner',
      'sessions',
      'menu',
      'changeDish',
      'submitOwnCart',
      'remove',
      'submit',
    ]);
    api.owner.and.returnValue(of(owner));
    api.sessions.and.returnValue(of(snapshot));
    api.menu.and.returnValue(of({ dishes: {} }));
    TestBed.configureTestingModule({
      imports: [GroupOrderPageComponent],
      providers: [
        provideRouter([]),
        { provide: GroupOrderService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ reservationId: 'r' }) } },
        },
      ],
    });
  });
  function create() {
    const fixture = TestBed.createComponent(GroupOrderPageComponent);
    fixture.detectChanges();
    return fixture;
  }
  it('separates all selected dishes from submitted totals', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    expect(page.snapshot().total).toBe(30);
    expect(page.submittedTotal()).toBe(20);
    expect(page.pendingCount()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Their dishes will be excluded');
  });
  it('updates participants and total after removal', () => {
    api.remove.and.returnValue(of({ participants: [snapshot.participants[0]], total: 10 }));
    const page = create().componentInstance;
    page.removeTarget.set(snapshot.participants[1]);
    page.removeGuest();
    expect(api.remove).toHaveBeenCalledWith('g', 'guest');
    expect(page.snapshot().total).toBe(10);
    expect(page.removeTarget()).toBeNull();
  });
  it('does not remove the organizer', () => {
    const page = create().componentInstance;
    page.removeTarget.set(snapshot.participants[0]);
    page.removeGuest();
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('locks controls after final submission', () => {
    api.submit.and.returnValue(of({ orderId: 'order', status: 'Submitted', total: 20 }));
    const fixture = create();
    const page = fixture.componentInstance;
    page.submitGroup();
    fixture.detectChanges();
    expect(api.submit).toHaveBeenCalledWith('g', 'r');
    expect(page.editable()).toBeFalse();
    page.changeDish('dish', true);
    expect(api.changeDish).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Changes are locked');
  });
  it('does not submit when no cart has been submitted', () => {
    snapshot.participants.forEach((participant) => (participant.isSubmitted = false));
    const page = create().componentInstance;
    page.submitGroup();
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('keeps totals and displays server error when removal fails', () => {
    api.remove.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'Group changed' } }))
    );
    const page = create().componentInstance;
    page.removeTarget.set(snapshot.participants[1]);
    page.removeGuest();
    expect(page.error()).toBe('Group changed');
    expect(page.snapshot().total).toBe(30);
    expect(page.busy()).toBeFalse();
  });
  it('loads a confirmed group without requesting an editable menu', () => {
    owner.canEdit = false;
    owner.status = 'Submitted';
    const page = create().componentInstance;
    expect(api.menu).not.toHaveBeenCalled();
    expect(page.editable()).toBeFalse();
  });
  it('blocks editing an already-submitted owner cart', () => {
    snapshot.participants[0].isSubmitted = true;
    const page = create().componentInstance;
    page.changeDish('dish', true);
    expect(api.changeDish).not.toHaveBeenCalled();
  });
});
