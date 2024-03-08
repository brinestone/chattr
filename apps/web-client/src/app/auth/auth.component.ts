import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { UserService } from '../services/user.service';

@Component({
  selector: 'chattr-auth-',
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
          <span class="p-float-label block w-full">
            <input formControlName="email" class="inline-block w-full p-inputtext-sm" autocomplete="current-username" type="email" id="email" pInputText>
            <label for="email">Email</label>
          </span>
          @if(form.controls.email.invalid && form.controls.email.dirty) {
            @if(form.controls.email.hasError('required')) {
              <span class="block text-red-500 text-xs">
                This field is required
              </span>
            }
          }
        </div>
        <div id="pass-panel w-full">
          <span class="p-float-label block w-full">
            <input class="p-inputtext-sm inline-block w-full" formControlName="password" type="password" pPassword autocomplete="current-password" inputId="password"/>
            <label for="password">Password</label>
          </span>
          @if(form.controls.password.invalid && form.controls.password.dirty) {
            @if(form.controls.password.hasError('required')) {
              <span class="block text-red-500 text-xs">
                This field is required
              </span>
            }
          }
        </div>
        <div class="w-full flex justify-center">
          <p-button size="small" loadingIcon="pi pi-spinner pi-spin" [loading]="isBusy() && !googleSignIn()" [disabled]="isBusy() || form.invalid" type="submit" label="Continue with Email"/>
        </div>
        <br/>
        <br/>
        <div class="flex justify-center">
          <p-button (onClick)="onContinueWithGoogleButtonClicked()" [loading]="isBusy() && googleSignIn()" size="small" loadingIcon="pi pi-spinner pi-spin" type="button" [disabled]="isBusy()" icon="pi pi-google" label="Continue with Google"></p-button>
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
  form = new FormGroup({
    email: new FormControl<string>('', { validators: [Validators.required] }),
    password: new FormControl<string>('', { validators: [Validators.required] })
  });

  isBusy = signal(false);
  googleSignIn = signal(false);
  errorMessage = signal('');
  private readonly userService = inject(UserService);
  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly messageService = inject(MessageService);

  onContinueWithGoogleButtonClicked() {
    this.isBusy.set(true);
    this.googleSignIn.set(true);
    this.userService.initGoogleSignIn().subscribe({
      error: (error: Error) => {
        this.messageService.add({
          summary: 'Error',
          detail: error.message,
          severity: 'error'
        });
        this.isBusy.set(false);
      },
      complete: () => {
        this.isBusy.set(false);
        this.dialogRef.close();
      }
    })
  }

  onFormSubmit() {
    this.isBusy.set(true);
    this.googleSignIn.set(false);
    const { email, password } = this.form.value;
    this.userService.initEmailSignIn(String(email), String(password)).subscribe({
      error: (error: Error) => {
        this.messageService.add({
          summary: 'Error',
          detail: error.message,
          severity: 'error'
        });
        this.isBusy.set(false);
      },
      complete: () => {
        this.isBusy.set(false);
        this.dialogRef.close();
      }
    });
  }
}
