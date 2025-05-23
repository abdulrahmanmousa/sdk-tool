import type { PluginName } from '../types';

export interface Config extends PluginName<'fastify'> {
  /**
   * Name of the generated file.
   * @default 'fastify'
   */
  output?: string;
}
