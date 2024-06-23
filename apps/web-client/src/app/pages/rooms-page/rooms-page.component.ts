import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
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
import { RouterLink } from '@angular/router';
import { Actions, dispatch, select } from '@ngxs/store';
import { NgxJdenticonModule } from 'ngx-jdenticon';
import { MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { GalleriaModule } from 'primeng/galleria';
import { InputTextModule } from 'primeng/inputtext';
import { MenubarModule } from 'primeng/menubar';
import { CreateRoom, LoadRooms, SignOut } from '../../actions';
import { AuthComponent } from '../../auth/auth.component';
import { Selectors } from '../../state/selectors';
import { errorToMessage, monitorAction } from '../../util';

@Component({
  selector: 'chattr-rooms-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    GalleriaModule,
    NgxJdenticonModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    FormsModule,
    ReactiveFormsModule,
    AuthComponent,
    AutoCompleteModule,
    MenubarModule,
  ],
  templateUrl: './rooms-page.component.html',
  styleUrl: './rooms-page.component.scss',
})
export class RoomsPageComponent implements OnInit {
  private readonly createRoomFn = dispatch(CreateRoom);
  private readonly loadRoomFn = dispatch(LoadRooms);
  private readonly signOutFn = dispatch(SignOut);
  private readonly actions = inject(Actions);
  private readonly messageService = inject(MessageService);
  readonly rooms = select(Selectors.rooms);
  readonly form = new FormGroup({
    name: new FormControl<string>('', { validators: [Validators.required] }),
  });
  readonly creatingRoom = toSignal<boolean>(monitorAction(this.actions, CreateRoom, () => true, () => false));
  readonly openNewRoomDialog = signal(false);
  readonly isSignedIn = select(Selectors.isSignedIn);
  readonly openAuthDialog = computed(() => !this.isSignedIn());

  ngOnInit(): void {
    this.loadRoomFn();
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
}
