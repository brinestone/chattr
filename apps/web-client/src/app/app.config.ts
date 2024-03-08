import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { browserSessionPersistence, getAuth, provideAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withViewTransitions } from '@angular/router';
import { setPersistence } from '@firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { environment } from '../environments/environment.development';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withViewTransitions()),
    provideAnimations(),
    provideHttpClient(),
    importProvidersFrom([
      provideFirebaseApp(() => {
        return initializeApp(environment.firebaseConfig);
      }),
      provideAuth(() => {
        const auth = getAuth();
        auth.useDeviceLanguage();
        setPersistence(auth, browserSessionPersistence);
        return auth;
      }),
      provideFirestore(() => getFirestore())
    ])
  ],
};
