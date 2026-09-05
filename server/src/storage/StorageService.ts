/**
 * StorageService — registry of storage devices → providers.
 *
 * Built once from `config.storageDevices[]` at app init. Owns the device
 * list (safe, public shape) and routes `browse`/provider access by device id.
 */
import { StorageError, type StorageDeviceConfig, type StorageEntry, type StorageProvider } from './types.js';
import { createStorageProvider } from './createStorageProvider.js';

/**
 * The device shape we expose to the UI / API. Crucially this NEVER includes
 * secret-bearing fields (accessKeyEnv/secretKeyEnv are env var NAMES, but we
 * still keep them internal-only and return the safe subset here).
 */
export interface PublicStorageDevice {
  id: string;
  label: string;
  kind: StorageDeviceConfig['kind'];
  default: boolean;
}

export type { StorageEntry };

export class StorageService {
  private readonly providers = new Map<string, StorageProvider>();
  private readonly devices: StorageDeviceConfig[];

  constructor(
    devices: StorageDeviceConfig[],
    factory: (device: StorageDeviceConfig) => StorageProvider = createStorageProvider,
  ) {
    this.devices = devices;
    for (const device of devices) {
      this.providers.set(device.id, factory(device));
    }
  }

  /** Safe, public description of every configured device. */
  listDevices(): PublicStorageDevice[] {
    return this.devices.map((d) => ({
      id: d.id,
      label: d.label,
      kind: d.kind,
      default: d.default ?? false,
    }));
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  getProvider(id: string): StorageProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new StorageError('NOT_FOUND', `storage device not found: ${id}`);
    }
    return provider;
  }

  async browse(id: string, path = ''): Promise<StorageEntry[]> {
    return this.getProvider(id).list(path);
  }
}