import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { Selectors } from '../state/selectors';
import { environment } from '../../environments/environment.development';

export const jwtTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const token = store.selectSnapshot(Selectors.accessToken);
  const signedIn = store.selectSnapshot(Selectors.accessToken);
  const url = new URL(req.urlWithParams);

  if (token && signedIn && url.origin == environment.backendOrigin) {
    return next(req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    }));
  }

  return next(req);
};
