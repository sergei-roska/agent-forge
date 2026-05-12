/**
 * Shared TypeScript types for Drupal API responses.
 * Grounded in real Drupal JSON:API and internal API shapes.
 */

// ---- JSON:API envelope ----

export interface JsonApiResource {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, {
    data: { type: string; id: string } | { type: string; id: string }[] | null;
  }>;
  links?: Record<string, string>;
}

export interface JsonApiResponse {
  data: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
  links?: {
    self?: string;
    next?: string;
    prev?: string;
  };
  meta?: Record<string, unknown>;
}

export interface JsonApiIndexResponse {
  jsonapi?: Record<string, unknown>;
  data?: unknown;
  meta?: Record<string, unknown>;
  links: Record<string, string>;
}

// ---- Internal API / custom endpoint shapes ----

export interface DrupalEntityTypeInfo {
  entity_type_id: string;
  label: string;
  provider: string;
  bundle_entity_type: string | null;
  revisionable: boolean;
  translatable: boolean;
}

export interface DrupalBundleInfo {
  entity_type_id: string;
  bundle: string;
  label: string;
  description: string;
}

export interface DrupalFieldDefinition {
  field_name: string;
  field_type: string;
  entity_type_id: string;
  target_bundle: string | null;
  required: boolean;
  translatable: boolean;
  cardinality: number;
  is_base_field: boolean;
}

export interface DrupalModuleInfo {
  machine_name: string;
  name: string;
  package: string;
  version: string | null;
  status: boolean;
  dependencies_count: number;
}

export interface DrupalThemeInfo {
  machine_name: string;
  name: string;
  status: boolean;
  is_default: boolean;
  is_admin: boolean;
  base_theme: string | null;
}

export interface DrupalRouteInfo {
  route_name: string;
  path: string;
  defaults_summary: Record<string, string>;
  requirements_summary: Record<string, string>;
}

export interface DrupalPermissionInfo {
  permission: string;
  title: string;
  provider: string;
  assigned_roles: string[];
}

export interface DrupalPluginInfo {
  plugin_id: string;
  label: string;
  provider: string;
  class: string;
  derivative: boolean;
}

export interface DrupalServiceInfo {
  service_id: string;
  class: string;
  public: boolean;
  tags: string[];
}

export interface DrupalMenuInfo {
  menu_name: string;
  label: string;
  link_count: number;
  provider: string;
}

export interface DrupalVocabularyInfo {
  vocabulary: string;
  label: string;
  description: string;
  term_count: number;
}
