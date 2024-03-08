import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem, PrimeIcons, PrimeNGConfig } from 'primeng/api';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { UserService } from './services/user.service';

@Component({
  standalone: true,
  imports: [RouterOutlet, MenubarModule, ButtonModule],
  selector: 'chattr-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly primeNgConfig = inject(PrimeNGConfig);
  readonly userService = inject(UserService);

  readonly menu: MenuItem[] = [{
    label: 'Home',
    routerLink: '/',
    icon: PrimeIcons.HOME
  }]
  ngOnInit(): void {
    this.primeNgConfig.ripple = true;
  }

  onSignInButtonClicked() {
    this.userService.initSignIn();
  }

  onSignOutButtonClicked() {
    this.userService.signOut();
  }
}
