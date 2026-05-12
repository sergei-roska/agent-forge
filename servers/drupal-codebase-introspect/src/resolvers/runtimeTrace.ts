import { ControllerResolver } from './controllers.js';
import { ServiceResolver } from './services.js';
import { HookResolver } from './hooks.js';
import { PreprocessResolver } from './preprocess.js';
import { PluginResolver } from './plugins.js';
import { FormResolver } from './forms.js';
import { EventResolver } from './events.js';

export class RuntimeTraceResolver {
  constructor(
    private controllers: ControllerResolver,
    private services: ServiceResolver,
    private hooks: HookResolver,
    private preprocess: PreprocessResolver,
    private plugins: PluginResolver,
    private forms: FormResolver,
    private events: EventResolver
  ) {}

  async trace(domain: string, identifier: string, secondaryIdentifier?: string, limit: number = 5) {
    let candidates: any[] = [];

    switch (domain) {
      case 'route':
        candidates = await this.controllers.findHandlers(identifier);
        break;
      case 'service':
        candidates = await this.services.findDefinitions(identifier);
        break;
      case 'hook':
        candidates = await this.hooks.findImplementations(identifier);
        break;
      case 'preprocess':
        candidates = await this.preprocess.findFunctions(identifier, secondaryIdentifier);
        break;
      case 'plugin':
        candidates = await this.plugins.findClasses(secondaryIdentifier, identifier);
        break;
      case 'form_class':
        candidates = await this.forms.findClasses(identifier);
        break;
      default:
        // Generic fallback search over multiple domains
        candidates = [
          ...(await this.controllers.findHandlers(identifier)),
          ...(await this.services.findDefinitions(identifier)),
          ...(await this.hooks.findImplementations(identifier)),
          ...(await this.plugins.findClasses(undefined, identifier)),
        ];
        break;
    }

    // Rank candidates by confidence and sort
    const ranked = candidates
      .map(c => ({ ...c, confidence: c.confidence || 0.5 }))
      .sort((a, b) => b.confidence - a.confidence);

    return ranked.slice(0, limit);
  }
}
