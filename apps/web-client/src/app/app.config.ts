import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { environment } from '../environments/environment.development';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withViewTransitions()),
    provideAnimations(),
    importProvidersFrom([
      provideFirebaseApp(() => {
        return initializeApp(environment.firebaseConfig);
      }),
      provideAuth(() => {
        const auth = getAuth();
        auth.useDeviceLanguage();
        return auth;
      }),
      provideDatabase(() => getDatabase())
    ])
  ],
};
