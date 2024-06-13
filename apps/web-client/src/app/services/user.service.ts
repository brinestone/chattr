import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ILoginRequest } from '@chattr/interfaces';
import { catchError, tap } from 'rxjs';
import { environment } from '../../environments/environment.development';
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
    return this.http.post(`${environment.backendOrigin}/users/login`, request, { observe: 'response', withCredentials: true }).pipe(
      // filter(event => event.type == HttpEventType.Response),
      tap(response => {
        const cookieHeader = response.headers
        console.log(cookieHeader);
      }),
      catchError(parseHttpClientError)
    );
  }
}
