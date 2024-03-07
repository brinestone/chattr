import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrimeNGConfig } from 'primeng/api';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  selector: 'chattr-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly primeNgConfig = inject(PrimeNGConfig);
  ngOnInit(): void {
    this.primeNgConfig.ripple = true;
  }
}
