import { AdminJSOptions } from 'adminjs';

import componentLoader from './component-loader.js';
import { model } from 'mongoose';
import { User, UserSchema } from '../../../../libs/domain/src/index.js'
import { IUser } from '../../../../libs/interfaces/src/index.js';

const options: AdminJSOptions = {
  componentLoader,
  rootPath: '/admin',
  resources: [model<IUser>(User.name, UserSchema)],
  databases: [],
};

export default options;
