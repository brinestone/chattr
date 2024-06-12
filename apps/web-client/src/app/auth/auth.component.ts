import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Actions, Store } from '@ngxs/store';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { SignIn } from '../actions';
import { errorToMessage, monitorAction } from '../util';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'chattr-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, PasswordModule, ButtonModule, ToastModule],
  template: `
    <!-- <p-toast /> -->
    <div class="w-full space-y-2">
      <form (ngSubmit)="onFormSubmit()" [formGroup]="form" class="py-3 pt-4 space-y-5" id="authForm">
      <!-- <span class="text-red-500 text-sm gap-2 flex items-center">
        <i class="pi pi-info-circle"></i> error message
      </span> -->
        <div>
          <label for="email">Email</label>
          <input formControlName="email" class="inline-block w-full p-inputtext-sm" autocomplete="current-username" type="email" id="email" pInputText>
          @if(form.controls.email.invalid && form.controls.email.dirty) {
            @if(form.controls.email.hasError('required')) {
              <span class="block text-red-500 text-xs">
                This field is required
              </span>
            }
          }
        </div>
        <div id="pass-panel w-full">
          <label for="password">Password</label>
          <input class="p-inputtext-sm inline-block w-full" formControlName="password" type="password" pPassword autocomplete="current-password" id="password"/>
          @if(form.controls.password.invalid && form.controls.password.dirty) {
            @if(form.controls.password.hasError('required')) {
              <span class="block text-red-500 text-xs">
                This field is required
              </span>
            }
          }
        </div>
        <div class="w-full flex justify-center">
          <p-button size="small" loadingIcon="pi pi-spinner pi-spin" [loading]="isBusy() ?? false" [disabled]="isBusy() || form.invalid" type="submit" label="Continue with Email"/>
        </div>
      </form>
    </div>
  `,
  styles: `
    :host {
      @apply block w-full;
    }
  `
})
export class AuthComponent {
  private readonly actions = inject(Actions);
  private readonly store = inject(Store);
  private readonly messageService = inject(MessageService);

  form = new FormGroup({
    email: new FormControl<string>('', { validators: [Validators.required] }),
    password: new FormControl<string>('', { validators: [Validators.required] })
  });

  readonly isBusy = toSignal<boolean>(monitorAction<boolean>(this.actions, SignIn, () => true, () => false))

  onFormSubmit() {
    const { email, password } = this.form.value;
    this.store.dispatch(new SignIn(String(email), String(password))).subscribe({
      error: (error: Error) => {
        this.messageService.add(errorToMessage(error));
      }
    })
  }
}
