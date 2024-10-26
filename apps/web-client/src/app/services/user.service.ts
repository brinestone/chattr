import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ILoginRequest, ILoginResponse, INotification, ISignupRequest } from '@chattr/interfaces';
import { Store } from '@ngxs/store';
import { EventSourcePlus } from 'event-source-plus';
import { jwtDecode } from 'jwt-decode';
import { Observable, catchError } from 'rxjs';
import { environment } from '../../environments/environment.development';
import { handleUnauthorizedResponse, parseHttpClientError } from '../util';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);

  isSignedIn(jwt: string) {
    try {
      const { exp } = jwtDecode(jwt);

      if (exp === undefined) return false;
      const now = Date.now();

      return (exp * 1000) > now;
    } catch (err) {
      return false;
    }
  }

  getLiveNotifications(authToken: string) {
    // const { sub } = jwtDecode(authToken);
    return new Observable<INotification>(subscriber => {
      const eventSource = new EventSourcePlus(`${environment.backendOrigin}/updates/live`, {
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });
      eventSource.retryInterval = 5000;
      eventSource.retryCount = 20;
      const controller = eventSource.listen({
        onMessage: ({ data }) => {
          subscriber.next(JSON.parse(data));
        },
        onRequestError: ({ error }) => {
          console.error(error);
          subscriber.error(error);
        }
      });
      subscriber.add(() => controller.abort());
    });
  }

  getNotifications(offset?: string) {
    return this.http.get<INotification[]>(`${environment.backendOrigin}/updates`, {
      params: {
        unseenOnly: false,
        offset: offset ?? ''
      }
    }).pipe(
      catchError(handleUnauthorizedResponse(this.store)),
      catchError(parseHttpClientError)
    )
  }

  signUp(request: ISignupRequest) {
    return this.http.post(`${environment.backendOrigin}/auth/signup`, request).pipe(
      catchError(handleUnauthorizedResponse(this.store)),
      catchError(parseHttpClientError)
    )
  }

  signIn(request: ILoginRequest) {
    return this.http.post<ILoginResponse>(`${environment.backendOrigin}/auth/login`, request).pipe(
      // catchError(handleUnauthorizedResponse(this.store)),
      catchError(parseHttpClientError)
    );
  }
}

