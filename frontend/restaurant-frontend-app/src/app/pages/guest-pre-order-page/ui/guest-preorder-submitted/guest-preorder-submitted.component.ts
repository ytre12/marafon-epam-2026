import { LocalizedDatePipe } from '@app/shared/i18n/localized-date.pipe';
import { TranslatePipe } from '@app/shared/i18n/translate.pipe';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { CustomButtonComponent } from '@app/shared/custom-components/custom-button/custom-button.component';
import { GuestCartItem } from '../../state/guest-preorder.store';

@Component({
    standalone: true,
    selector: 'app-guest-preorder-submitted',
    templateUrl: './guest-preorder-submitted.component.html',
    styleUrl: './guest-preorder-submitted.component.scss',
    imports: [LocalizedDatePipe, TranslatePipe, CurrencyPipe, CustomButtonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestPreorderSubmittedComponent {
    readonly invite = input<GuestInvite | null>(null);
    readonly guestName = input('');
    readonly items = input<GuestCartItem[]>([]);
    readonly total = input(0);

    readonly createNew = output<void>();
}