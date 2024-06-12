import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ILoginRequest } from '@chattr/interfaces';
import { environment } from '../../environments/environment.development';
import { catchError, filter, map } from 'rxjs';
import { parseHttpClientError } from '../util';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private readonly http = inject(HttpClient);

  isSignedIn() {
    return false;
  }
  signIn(request: ILoginRequest) {
    return this.http.post(`${environment.backendOrigin}/users/login`, request, { observe: 'events', withCredentials: true }).pipe(
      filter(event => event.type == HttpEventType.Response),
      map(ev => {
        ev.
      }),
      catchError(parseHttpClientError)
    );
  }
}
