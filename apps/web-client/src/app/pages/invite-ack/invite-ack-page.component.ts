import { SlicePipe } from '@angular/common';
import { AfterViewInit, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Actions, dispatch, ofActionCompleted, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { filter, map, take } from 'rxjs';
import { InvitationInfoLoaded, LoadInvitationInfo, UpdateInvite } from '../../actions';
import { Selectors } from '../../state/selectors';
import { errorToMessage } from '../../util';
// const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').substring(1);
function extractInitials(text?: string) {
  if (!text) return '';
  const tokens = text.trim().toUpperCase().split(' ').map(x => x[0]);
  if (!tokens) return '';
  return [tokens[0], tokens[1]].join('');
}

@Component({
  selector: 'chattr-invite-ack-page',
  standalone: true,
  imports: [
    ProgressSpinnerModule,
    AvatarGroupModule,
    DividerModule,
    CardModule,
    SlicePipe,
    AvatarModule,
    ButtonModule
  ],
  templateUrl: './invite-ack-page.component.html',
  styleUrl: './invite-ack-page.component.scss',
})
export class InviteAckPageComponent implements AfterViewInit {
  private readonly loadInviteIfo = dispatch(LoadInvitationInfo);
  private readonly updateInvite = dispatch(UpdateInvite);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly inviteCode = this.activatedRoute.snapshot.queryParams['code'] as string | undefined;
  private readonly actions$ = inject(Actions);
  private invitationInfo$ = this.actions$.pipe(
    ofActionCompleted(InvitationInfoLoaded),
    filter(({ result }) => result.successful),
    map(({ action: { info } }) => info),
    take(1)
  );
  readonly principal = select(Selectors.principal)
  readonly updatingInvite = signal(false);
  readonly inviteInfo = toSignal(this.invitationInfo$);
  readonly inviteInitial = computed(() => {
    const invite = this.inviteInfo();
    if (!invite) return 'I';
    return extractInitials(invite.displayName);
  });
  readonly userInitials = computed(() => {
    const principal = this.principal();
    if (!principal) return 'U';
    return extractInitials(principal.displayName);
  });
  readonly connectedMembers = computed(() => {
    const invite = this.inviteInfo();
    let ans = (invite?.connectedMembers && invite.connectedMembers.length > 0) ? invite.connectedMembers : [];
    return ans.map(({ displayName, avatar }) => ({ avatar, displayName: extractInitials(displayName) }));
  });

  ngAfterViewInit() {
    if (this.inviteCode) {
      this.loadInviteIfo(this.inviteCode);
    }
  }

  onAcceptButtonClicked() {
    this.doUpdateInvite(true);
  }

  private doUpdateInvite(status: boolean) {
    this.updatingInvite.set(true);
    this.updateInvite(status, String(this.inviteCode)).subscribe({
      error: (error: Error) => {
        this.updatingInvite.set(false);
        this.messageService.add(errorToMessage(error));
      },
      complete: () => {
        this.updatingInvite.set(false);
        this.router.navigate(status ? ['/', 'rooms', String(this.inviteInfo()?.roomId)] : ['/'])
      }
    })
  }

  onDeclineButtonClicked() {
    this.doUpdateInvite(false);
  }
}
