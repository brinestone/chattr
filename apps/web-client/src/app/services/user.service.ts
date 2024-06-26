import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ILoginRequest, ILoginResponse, INotification, ISignupRequest } from '@chattr/interfaces';
import { jwtDecode } from 'jwt-decode';
import { Observable, catchError } from 'rxjs';
import { environment } from '../../environments/environment.development';
import { parseHttpClientError } from '../util';
import {} from 'event-source';
@Injectable({
  providedIn: 'root'
})
export class UserService {

  private readonly http = inject(HttpClient);

  isSignedIn(jwt: string) {
    const { exp } = jwtDecode(jwt);

    if (exp === undefined) return false;
    const now = Date.now();

    return (exp * 1000) > now;
  }

  getLiveNotifications(authToken: string) {
    // const { sub } = jwtDecode(authToken);
    return new Observable<INotification>(subscriber => {
      const eventSource = new EventSourcePollyfill(`${environment.backendOrigin}/notifications/live`, {
        authorizationHeader: authToken
      });

      subscriber.add(() => eventSource.close());

      eventSource.onmessage = ({ data }: MessageEvent) => {
        subscriber.next(JSON.parse(data));
      }
      eventSource.onerror = (e: Event) => {
        console.error(e);
        subscriber.error(e);
      }
    });
  }

  getNotifications(offset?: string) {
    return this.http.get<INotification[]>(`${environment.backendOrigin}/notifications`, {
      params: {
        seenOnly: false,
        offset: offset ?? ''
      }
    }).pipe(
      catchError(parseHttpClientError)
    )
  }

  signUp(request: ISignupRequest) {
    return this.http.post(`${environment.backendOrigin}/auth/signup`, request).pipe(
      catchError(parseHttpClientError)
    )
  }

  signIn(request: ILoginRequest) {
    return this.http.post<ILoginResponse>(`${environment.backendOrigin}/auth/login`, request).pipe(
      catchError(parseHttpClientError)
    );
  }
}
