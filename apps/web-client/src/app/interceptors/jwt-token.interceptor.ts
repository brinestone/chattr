import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { Selectors } from '../state/selectors';

export const jwtTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const token = store.selectSnapshot(Selectors.accessToken);
  const signedIn = store.selectSnapshot(Selectors.accessToken);

  if (token && signedIn) {
    return next(req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    }));
  }

  return next(req);
};
