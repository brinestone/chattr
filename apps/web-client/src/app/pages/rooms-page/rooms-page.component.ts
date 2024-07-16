import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Actions, dispatch, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { CreateRoom, LoadRooms, SignOut } from '../../actions';
import { AuthComponent } from '../../auth/auth.component';
import { Selectors } from '../../state/selectors';
import { errorToMessage, extractInitials, monitorAction } from '../../util';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'chattr-rooms-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TagModule,
    DataViewModule,
    ButtonModule,
    DividerModule,
    DialogModule,
    AvatarModule,
    InputTextModule,
    FormsModule,
    ReactiveFormsModule,
    AuthComponent,
  ],
  templateUrl: './rooms-page.component.html',
  styleUrl: './rooms-page.component.scss',
})
export class RoomsPageComponent {
  private readonly createRoomFn = dispatch(CreateRoom);
  private readonly loadRoomFn = dispatch(LoadRooms);
  private readonly signOutFn = dispatch(SignOut);
  private readonly router = inject(Router);
  private readonly actions = inject(Actions);
  private readonly messageService = inject(MessageService);
  private readonly routeParams = toSignal(inject(ActivatedRoute).queryParams);
  readonly principal = select(Selectors.principal);
  readonly redirect = computed(() => {
    const continueTo = this.routeParams()?.['continue'];
    if (!continueTo) return undefined;
    return decodeURIComponent(continueTo);
  });
  readonly authTab = computed(() => {
    const tab = this.routeParams()?.['tab'];
    return tab ?? 'sign-up';
  })
  readonly rooms = select(Selectors.rooms);
  readonly form = new FormGroup({
    name: new FormControl<string>('', { validators: [Validators.required] }),
  });
  readonly creatingRoom = toSignal<boolean>(monitorAction(this.actions, CreateRoom, () => true, () => false));
  readonly openNewRoomDialog = signal(false);
  readonly isSignedIn = select(Selectors.isSignedIn);
  readonly openAuthDialog = computed(() => !this.isSignedIn());
  readonly extractInitials = extractInitials;

  constructor() {
    effect(() => {
      if (this.isSignedIn())
        this.loadRoomFn();
    }, { allowSignalWrites: true })
  }

  onSignOutButtonClicked() {
    this.signOutFn();
  }

  onNewRoomFormSubmit() {
    this.createRoomFn(String(this.form.value.name)).subscribe({
      error: (error: Error) => {
        this.messageService.add(errorToMessage(error));
      },
      complete: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `${this.form.value.name} was created successfully`
        });
        this.openNewRoomDialog.set(false);
      }
    });
  }

  onNewRoomDialogHide() {
    this.form.reset();
    this.form.markAsPristine();
  }

  onUserSignedIn() {
    const redirect = this.redirect();
    if (redirect) {
      this.router.navigateByUrl(decodeURIComponent(redirect));
    }
  }
}
