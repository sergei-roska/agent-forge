import { PhpScanner } from '../repo/phpSymbols.js';

export class DrushResolver {
  constructor(private php: PhpScanner) {}

  async findCommands(commandName?: string) {
    const symbols = await this.php.scan();
    let commands = symbols.filter(s => s.type === 'drush_command');

    // We can't perfectly extract the command string statically without parsing attributes/annotations,
    // so if a specific command name is requested, we search the class file content.
    if (commandName) {
      commands = commands.filter(s => s.content.includes(commandName) || s.name.includes(commandName));
    }

    return commands.map(s => {
      return {
        command_name: commandName || 'unknown (static analysis limitation)',
        class: s.name,
        file_path: s.file,
        confidence: 0.7,
      };
    });
  }
}
