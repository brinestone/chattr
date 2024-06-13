import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  importProvidersFrom,
  isDevMode,
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withViewTransitions } from '@angular/router';
import { NgxsReduxDevtoolsPluginModule, withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { NgxsLoggerPluginModule, withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { NgxsStoragePluginModule, StorageOption, withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { NgxsModule, provideStore } from '@ngxs/store';
import { appRoutes } from './app.routes';
import { RoomState } from './state/room.state';
import { UserState } from './state/user.state';
import { jwtTokenInterceptor } from './interceptors/jwt-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withViewTransitions()),
    provideAnimations(),
    provideHttpClient(withInterceptors([jwtTokenInterceptor])),
    provideStore([UserState, RoomState],
      withNgxsLoggerPlugin({
        disabled: !isDevMode()
      }),
      withNgxsReduxDevtoolsPlugin({
        disabled: !isDevMode()
      }),
      withNgxsStoragePlugin({
        storage: StorageOption.SessionStorage,
        keys: '*'
      }))
  ],
};
