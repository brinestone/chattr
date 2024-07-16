import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  isDevMode
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withViewTransitions } from '@angular/router';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { StorageOption, withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { provideStore } from '@ngxs/store';
import { appRoutes } from './app.routes';
import { jwtTokenInterceptor } from './interceptors/jwt-token.interceptor';
import { DEVICE_STATE, DeviceState } from './state/devices.state';
import { RoomState } from './state/room.state';
import { USER_STATE, UserState } from './state/user.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withViewTransitions()),
    provideAnimations(),
    provideHttpClient(withInterceptors([jwtTokenInterceptor])),
    provideStore([UserState, RoomState, DeviceState],
      withNgxsLoggerPlugin({
        disabled: !isDevMode()
      }),
      withNgxsReduxDevtoolsPlugin({
        disabled: !isDevMode()
      }),
      withNgxsStoragePlugin({
        storage: StorageOption.SessionStorage,
        keys: [USER_STATE, DEVICE_STATE]
      }))
  ],
};
