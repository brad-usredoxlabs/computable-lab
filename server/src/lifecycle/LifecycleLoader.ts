import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { LifecycleEngine } from './LifecycleEngine'
import type { LifecycleSpec } from './types'

/**
 * Load all lifecycle YAML files from a directory and register them with the engine.
 * @param dir Directory containing *.lifecycle.yaml files
 * @param engine LifecycleEngine to register the specs with
 * @returns Number of lifecycles successfully loaded
 */
export function loadLifecyclesFromDir(dir: string, engine: LifecycleEngine): number {
  let count = 0

  try {
    const files = readdirSync(dir)
    const yamlFiles = files.filter(f => f.endsWith('.lifecycle.yaml'))

    for (const file of yamlFiles) {
      const filePath = join(dir, file)
      try {
        const content = readFileSync(filePath, 'utf-8')
        const spec = parse(content) as LifecycleSpec
        engine.loadLifecycle(spec)
        count++
        console.log(`Loaded lifecycle: ${spec.id} from ${file}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`Failed to parse lifecycle file ${file}: ${msg}`)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`Failed to read lifecycle directory ${dir}: ${msg}`)
  }

  return count
}
