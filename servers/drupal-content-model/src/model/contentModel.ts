import { DrupalClient } from '@agent-forge/drupal-api-client';

export interface ContentTypeSummary {
  bundle: string;
  label: string;
  description: string;
  revisionable: boolean;
  preview_mode: string;
  workflow: string | null;
}

export class ContentModelAdapter {
  constructor(private client: DrupalClient) {}

  async listContentTypes(): Promise<ContentTypeSummary[]> {
    const resourceTypes = await this.client.listJsonApiResourceTypes();
    return resourceTypes
      .filter((type: string) => type.startsWith('node--'))
      .map((type: string) => {
        const [, bundle] = type.split('--');
        return {
          bundle: bundle ?? type,
          label: bundle ?? type,
          description: `Discovered from JSON:API resource type "${type}".`,
          revisionable: false,
          preview_mode: '0',
          workflow: null,
        } satisfies ContentTypeSummary;
      })
      .sort((a: ContentTypeSummary, b: ContentTypeSummary) => a.bundle.localeCompare(b.bundle));
  }

  async listMediaTypes(): Promise<any[]> {
    const resourceTypes = await this.client.listJsonApiResourceTypes();
    return resourceTypes
      .filter((type: string) => type.startsWith('media--'))
      .map((type: string) => {
        const [, bundle] = type.split('--');
        return {
          bundle: bundle ?? type,
          label: bundle ?? type,
          source_plugin: 'unknown',
          revisionable: false,
          translatable: false,
        };
      });
  }

  async listTaxonomyModels(): Promise<any[]> {
    const resourceTypes = await this.client.listJsonApiResourceTypes();
    return resourceTypes
      .filter((type: string) => type.startsWith('taxonomy_term--'))
      .map((type: string) => {
        const [, vocabulary] = type.split('--');
        return {
          vocabulary: vocabulary ?? type,
          label: vocabulary ?? type,
          term_count: 0,
          reference_field_count: 0,
        };
      });
  }

  async getFieldUsage(entityTypeId: string, bundle?: string): Promise<any[]> {
    const targetType = bundle ? `${entityTypeId}--${bundle}` : undefined;
    const resourceTypes = await this.client.listJsonApiResourceTypes();
    const firstType = targetType && resourceTypes.includes(targetType) ? targetType : resourceTypes.find((t: string) => t.startsWith(`${entityTypeId}--`));
    if (!firstType) return [];

    const sample = await this.client.getJsonApiCollection(firstType, { 'page[limit]': '1' });
    const first = Array.isArray(sample.data) ? sample.data[0] : sample.data;
    if (!first) return [];

    const attributeKeys = Object.keys(first.attributes ?? {});
    const relationshipKeys = Object.keys(first.relationships ?? {});

    return [
      ...attributeKeys.map((fieldName) => ({
        field_name: fieldName,
        field_type: 'attribute',
        bundles: [firstType.split('--')[1]],
      })),
      ...relationshipKeys.map((fieldName) => ({
        field_name: fieldName,
        field_type: 'relationship',
        bundles: [firstType.split('--')[1]],
      })),
    ];
  }

  async getReferenceGraph(entityTypeId: string, bundle?: string): Promise<any[]> {
    const targetType = bundle ? `${entityTypeId}--${bundle}` : undefined;
    const resourceTypes = await this.client.listJsonApiResourceTypes();
    const firstType = targetType && resourceTypes.includes(targetType) ? targetType : resourceTypes.find((t: string) => t.startsWith(`${entityTypeId}--`));
    if (!firstType) return [];

    const sample = await this.client.getJsonApiCollection(firstType, { 'page[limit]': '1' });
    const first = Array.isArray(sample.data) ? sample.data[0] : sample.data;
    if (!first?.relationships) return [];

    return Object.entries(first.relationships).map(([fieldName, rel]: [string, any]) => {
      const firstRel = Array.isArray(rel.data) ? rel.data[0] : rel.data;
      return {
        from_bundle: firstType.split('--')[1],
        field_name: fieldName,
        target_entity_type: firstRel?.type?.split('--')[0] ?? 'unknown',
        target_bundle: firstRel?.type?.split('--')[1] ?? 'unknown',
      };
    });
  }
}
