import { SetMetadata } from "@nestjs/common";

export const ALLOW_ANONYMOUS = 'allowAnonymous';
export const AllowAnonymous = () => SetMetadata(ALLOW_ANONYMOUS, true);
