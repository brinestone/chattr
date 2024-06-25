import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Actions, dispatch } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TabViewModule } from 'primeng/tabview';
import { ToastModule } from 'primeng/toast';
import { SignIn, SignUp } from '../actions';
import { errorToMessage, monitorAction } from '../util';

@Component({
  selector: 'chattr-auth',
  standalone: true,
  imports: [CommonModule, TabViewModule, FormsModule, ReactiveFormsModule, InputTextModule, PasswordModule, ButtonModule, ToastModule],
  templateUrl: './auth.component.html',
  styles: `
    :host {
      @apply block w-full;
    }
  `
})
export class AuthComponent {
  private readonly actions = inject(Actions);
  private readonly authFn = dispatch(SignIn);
  private readonly signUpFn = dispatch(SignUp);
  readonly startingTab = input<'sign-in' | 'sign-up'>('sign-up');
  readonly activeIndex = computed(() => this.startingTab() == 'sign-in' ? 1 : 0);
  @Output()
  readonly signedIn = new EventEmitter();
  private readonly messageService = inject(MessageService);

  form = new FormGroup({
    email: new FormControl<string>('', { validators: [Validators.required] }),
    password: new FormControl<string>('', { validators: [Validators.required] })
  });

  signUpForm = new FormGroup({
    email: new FormControl<string>('', { validators: [Validators.required, Validators.email] }),
    password: new FormControl<string>('', { validators: [Validators.required] }),
    name: new FormControl<string>('', [Validators.required])
  })

  readonly signingIn = toSignal<boolean>(monitorAction<boolean>(this.actions, SignIn, () => true, () => false))
  readonly signingUp = toSignal<boolean>(monitorAction<boolean>(this.actions, SignUp, () => true, () => false))

  onFormSubmit() {
    const { email, password } = this.form.value;
    this.authFn(String(email), String(password)).subscribe({
      error: (error: Error) => {
        this.messageService.add(errorToMessage(error));
      },
      complete: () => {
        console.log('here');
        this.signedIn.emit();
      }
    })
  }

  onSignUpFormSubmit() {
    const { email, name, password } = this.signUpForm.value;
    this.signUpFn(String(email), String(name), String(password)).subscribe({
      error: (error: Error) => {
        this.messageService.add(errorToMessage(error));
      },
      complete: () => {
        this.authFn(String(email), String(password)).subscribe({
          complete: () => this.signedIn.emit()
        });
        this.signUpForm.reset();
      }
    })
  }
}
