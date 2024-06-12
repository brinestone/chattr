import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Room } from '@chattr/interfaces';
import { NgxJdenticonModule } from 'ngx-jdenticon';
import { MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { Dialog, DialogModule } from 'primeng/dialog';
import { DialogService } from 'primeng/dynamicdialog';
import { GalleriaModule } from 'primeng/galleria';
import { InputTextModule } from 'primeng/inputtext';
import { AuthComponent } from '../../auth/auth.component';
import { RoomService } from '../../services/room.service';

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
  ],
  templateUrl: './rooms-page.component.html',
  styleUrl: './rooms-page.component.scss',
})
export class RoomsPageComponent implements OnInit {
  @ViewChild(Dialog) private dialogRef!: Dialog;
  private readonly roomService = inject(RoomService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  readonly rooms = signal<Room[]>([]);
  readonly form = new FormGroup({
    name: new FormControl<string>('', { validators: [Validators.required] }),
  });
  readonly isBusy = signal(false);
  readonly openNewRoomDialog = signal(false);
  readonly openAuthDialog = signal(true);
  
  ngOnInit(): void {
    // this.isBusy.set(true);
    this.roomService
      .getRooms$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.rooms.set([...data]);
        },
      });
  }

  onNewRoomFormSubmit() {
    this.isBusy.set(true);
    this.roomService.createRoom(String(this.form.value.name)).subscribe({
      error: (error: Error) => {
        this.isBusy.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message,
        });
      },
      complete: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Room created successfully',
        });
        this.isBusy.set(false);
        this.openNewRoomDialog.set(false);
      },
    });
  }

  onNewRoomDialogHide() {
    this.form.reset();
    this.form.markAsPristine();
  }
}
