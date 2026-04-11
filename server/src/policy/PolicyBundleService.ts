import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import type { CompilerPolicySettings } from './types'
import { DEFAULT_COMPILER_POLICY_SETTINGS } from './types'

export interface PolicyBundle {
  id: string
  label: string
  level: number
  description?: string
  settings: Partial<CompilerPolicySettings>
}

export class PolicyBundleService {
  private bundles: Map<string, PolicyBundle> = new Map()

  loadFromDir(dir: string): number {
    let count = 0
    try {
      const files = readdirSync(dir)
      const yamlFiles = files.filter(f => f.endsWith('.policy-bundle.yaml'))
      for (const file of yamlFiles) {
        const filePath = join(dir, file)
        const content = readFileSync(filePath, 'utf-8')
        const data = parse(content) as PolicyBundle
        if (data.id) {
          this.bundles.set(data.id, data)
          count++
        }
      }
    } catch (err) {
      console.warn('Failed to load policy bundles:', err instanceof Error ? err.message : err)
    }
    return count
  }

  getBundle(id: string): PolicyBundle | undefined {
    return this.bundles.get(id)
  }

  listBundles(): PolicyBundle[] {
    return Array.from(this.bundles.values()).sort((a, b) => a.level - b.level)
  }

  resolveSettings(bundleId: string): CompilerPolicySettings {
    const bundle = this.bundles.get(bundleId)
    if (!bundle) {
      return { ...DEFAULT_COMPILER_POLICY_SETTINGS }
    }
    return { ...DEFAULT_COMPILER_POLICY_SETTINGS, ...bundle.settings }
  }
}
