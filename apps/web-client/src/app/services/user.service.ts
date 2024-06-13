import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ILoginRequest, ILoginResponse } from '@chattr/interfaces';
import { jwtDecode } from 'jwt-decode';
import { catchError } from 'rxjs';
import { environment } from '../../environments/environment.development';
import { parseHttpClientError } from '../util';

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
  signIn(request: ILoginRequest) {
    return this.http.post<ILoginResponse>(`${environment.backendOrigin}/auth/login`, request).pipe(
      catchError(parseHttpClientError)
    );
  }
}
