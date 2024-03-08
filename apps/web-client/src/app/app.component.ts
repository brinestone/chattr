import { Component, OnInit, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem, MessageService, PrimeIcons, PrimeNGConfig } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogModule, DynamicDialogRef } from 'primeng/dynamicdialog';
import { MenubarModule } from 'primeng/menubar';
import { UserService } from './services/user.service';
import { AuthComponent } from './auth/auth.component';
import { ToastModule } from 'primeng/toast';

@Component({
  standalone: true,
  imports: [RouterOutlet, ToastModule, MenubarModule, ButtonModule, DynamicDialogModule],
  selector: 'chattr-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  providers: [DialogService, MessageService]
})
export class AppComponent implements OnInit {
  private readonly primeNgConfig = inject(PrimeNGConfig);
  private dialogRef?: DynamicDialogRef;
  private readonly dialogService = inject(DialogService);
  readonly userService = inject(UserService);

  readonly menu: MenuItem[] = [{
    label: 'Home',
    routerLink: '/',
    icon: PrimeIcons.HOME
  }];

  constructor() {
    effect(() => {
      if (this.userService.isSignedIn()) {
        this.dialogRef?.close();
        return;
      }
      this.openAuthDialog();
    });
  }

  private openAuthDialog() {
    this.dialogRef = this.dialogService.open(AuthComponent, {
      header: 'Connect to your Account',
      breakpoints: {
        '768px': '50vw',
        '640px': '98vw',
      },
      closable: false,
      modal: true
    });
  }
  ngOnInit(): void {
    this.primeNgConfig.ripple = true;
  }

  onSignInButtonClicked() {
    this.userService.initGoogleSignIn();
  }

  onSignOutButtonClicked() {
    this.userService.signOut();
  }
}
