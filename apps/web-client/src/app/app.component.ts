import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MessageService, PrimeNGConfig } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  standalone: true,
  imports: [RouterOutlet, ToastModule],
  selector: 'chattr-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  providers: [MessageService]
})
export class AppComponent implements OnInit {
  private readonly primeNgConfig = inject(PrimeNGConfig);
  ngOnInit(): void {
    this.primeNgConfig.ripple = true;
  }
}
