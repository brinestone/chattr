import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  importProvidersFrom,
  isDevMode,
} from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import {
  browserSessionPersistence,
  getAuth,
  provideAuth,
} from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withViewTransitions } from '@angular/router';
import { setPersistence } from '@firebase/auth';
import { NgxsReduxDevtoolsPluginModule } from '@ngxs/devtools-plugin';
import { NgxsLoggerPluginModule } from '@ngxs/logger-plugin';
import { NgxsStoragePluginModule, StorageOption } from '@ngxs/storage-plugin';
import { NgxsModule } from '@ngxs/store';
import { getFirestore } from 'firebase/firestore';
import { environment } from '../environments/environment.development';
import { appRoutes } from './app.routes';
import { DevicesState } from './state/devices.state';
import { UserState } from './state/user.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withViewTransitions()),
    provideAnimations(),
    provideHttpClient(),
    importProvidersFrom([
      NgxsModule.forRoot([DevicesState, UserState]),
      NgxsLoggerPluginModule.forRoot({ disabled: !isDevMode() }),
      NgxsStoragePluginModule.forRoot({
        storage: StorageOption.LocalStorage
      }),
      NgxsReduxDevtoolsPluginModule.forRoot({ disabled: !isDevMode() }),
      provideFirebaseApp(() => {
        return initializeApp(environment.firebaseConfig);
      }),
      provideAuth(() => {
        const auth = getAuth();
        auth.useDeviceLanguage();
        setPersistence(auth, browserSessionPersistence);
        return auth;
      }),
      provideFirestore(() => getFirestore()),
    ]),
  ],
};
