import { TranslatePipe } from '@app/shared/i18n/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, finalize, forkJoin, of, switchMap } from 'rxjs';
import { GroupOrderService } from '@app/services/group-order/group-order.service';
import {
  GroupParticipant,
  GroupSnapshot,
  OwnerSession,
} from '@app/models/group-order/group-order.model';
import {
  GuestMenuDish,
  GuestMenuResponse,
} from '@app/services/guest-sessions/guest-sessions.service';
import { getServerErrorMessage } from '@app/shared/helpers/http-error-helpers';

@Component({
  selector: 'app-group-order-page',
  standalone: true,
  imports: [TranslatePipe, CurrencyPipe, RouterLink],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupOrderPageComponent implements OnInit {
  private readonly api = inject(GroupOrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';
  readonly owner = signal<OwnerSession | null>(null);
  readonly snapshot = signal<GroupSnapshot>({ participants: [], total: 0 });
  readonly menu = signal<GuestMenuDish[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly confirmedTotal = signal<number | null>(null);
  readonly removeTarget = signal<GroupParticipant | null>(null);
  readonly confirmSubmit = signal(false);
  readonly ownCart = computed(() =>
    this.snapshot().participants.find(
      (participant) => participant.id === this.owner()?.guestSessionId
    )
  );
  readonly editable = computed(
    () => this.owner()?.canEdit === true && this.owner()?.status === 'Open'
  );
  readonly submittedTotal = computed(() =>
    this.snapshot()
      .participants.filter((participant) => participant.isSubmitted)
      .reduce((sum, participant) => sum + participant.total, 0)
  );
  readonly submittedCount = computed(
    () =>
      this.snapshot().participants.filter(
        (participant) => participant.isSubmitted && participant.items.length > 0
      ).length
  );
  readonly pendingCount = computed(
    () => this.snapshot().participants.filter((participant) => !participant.isSubmitted).length
  );
  readonly inviteLink = computed(() =>
    this.owner()?.inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(this.owner()!.inviteToken)}`
      : ''
  );

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    if (this.busy() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .owner(this.reservationId)
      .pipe(
        switchMap((owner) => {
          this.owner.set(owner);
          return forkJoin({
            snapshot: this.api.sessions(owner.groupReservationId),
            menu: owner.canEdit
              ? this.api.menu(this.reservationId)
              : of<GuestMenuResponse>({ dishes: {} }),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (result) => {
          this.snapshot.set(result.snapshot);
          this.menu.set(Object.values(result.menu.dishes).flat());
        },
        error: (error) => this.fail(error),
      });
  }

  quantity(dishId: string): number {
    return this.ownCart()?.items.find((item) => item.dish.id === dishId)?.quantity ?? 0;
  }
  changeDish(dishId: string, add: boolean): void {
    if (!this.editable() || this.ownCart()?.isSubmitted) return;
    this.mutate(this.api.changeDish(this.reservationId, dishId, add));
  }
  submitOwnCart(): void {
    if (!this.editable() || this.ownCart()?.isSubmitted || !this.ownCart()?.items.length) return;
    this.mutate(this.api.submitOwnCart(this.reservationId));
  }
  removeGuest(): void {
    const target = this.removeTarget();
    const owner = this.owner();
    if (!owner || !target || target.type === 'Owner' || !this.editable()) return;
    this.mutate(this.api.remove(owner.groupReservationId, target.id));
  }
  submitGroup(): void {
    const owner = this.owner();
    if (!owner || !this.editable() || !this.submittedCount() || this.busy() || this.loading())
      return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .submit(owner.groupReservationId, this.reservationId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false))
      )
      .subscribe({
        next: (result) => {
          this.owner.set({ ...owner, canEdit: false, status: 'Submitted' });
          this.confirmSubmit.set(false);
          this.removeTarget.set(null);
          this.confirmedTotal.set(result.total);
        this.message.set(
            `Group order confirmed. Total: $${result.total.toFixed(2)}. Your waiter can now review it.`
          );
        },
        error: (error) => {
          this.confirmSubmit.set(false);
          this.fail(error);
        },
      });
  }
  private mutate(request: Observable<GroupSnapshot>): void {
    if (this.busy() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false))
      )
      .subscribe({
        next: (snapshot) => {
          this.snapshot.set(snapshot);
          this.removeTarget.set(null);
        },
        error: (error) => this.fail(error),
      });
  }
  private fail(error: unknown): void {
    this.error.set(
      (error instanceof HttpErrorResponse ? getServerErrorMessage(error) : '') ||
        'Unable to update the group. Refresh and try again.'
    );
  }
}
