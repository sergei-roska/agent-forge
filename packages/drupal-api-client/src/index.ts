export { DrupalClient, DrupalHttpError, createClientFromEnv } from './http/client.js';
export type { DrupalClientConfig } from './http/client.js';
export { authHeaders } from './auth.js';
export type { AuthStrategy, AuthBasic, AuthBearer, AuthApiKey } from './auth.js';
export type {
  JsonApiResource,
  JsonApiResponse,
  JsonApiIndexResponse,
  DrupalEntityTypeInfo,
  DrupalBundleInfo,
  DrupalFieldDefinition,
  DrupalModuleInfo,
  DrupalThemeInfo,
  DrupalRouteInfo,
  DrupalPermissionInfo,
  DrupalPluginInfo,
  DrupalServiceInfo,
  DrupalMenuInfo,
  DrupalVocabularyInfo,
} from './types.js';
