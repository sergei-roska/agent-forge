import { PhpScanner } from '../repo/phpSymbols.js';

export class EventResolver {
  constructor(private php: PhpScanner) {}

  async findSubscribers(eventName?: string) {
    const symbols = await this.php.scan();
    const subscribers = symbols.filter(s => s.type === 'event_subscriber');

    // We can't perfectly extract getSubscribedEvents() statically without an AST,
    // so we return the classes and indicate that event extraction is limited.
    return subscribers.map(s => {
      // Very basic static check if the event name is anywhere in the file content or symbol.
      // A more robust implementation would actually parse the method body.
      const match = !eventName || s.content.includes(eventName);
      if (!match) return null;

      return {
        class: s.name,
        events: ['unknown (static analysis limitation)'],
        file_path: s.file,
        module: s.file.split('/').find(p => p !== 'src' && p !== 'modules' && p !== 'custom'),
        confidence: 0.8,
      };
    }).filter(Boolean);
  }
}
