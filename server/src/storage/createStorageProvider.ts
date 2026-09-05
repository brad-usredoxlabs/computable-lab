/**
 * createStorageProvider — factory from a StorageDeviceConfig to a concrete
 * StorageProvider.
 *
 * `local-mount` needs no external SDK (pure Node fs). `s3` builds a provider
 * whose client is lazy-imported on first use, so local-only installs / tests
 * never pay for or depend on the AWS SDK.
 */
import { LocalMountStorageProvider } from './LocalMountStorageProvider.js';
import { S3StorageProvider } from './S3StorageProvider.js';
import { StorageError, type StorageDeviceConfig, type StorageProvider } from './types.js';

export function createStorageProvider(device: StorageDeviceConfig): StorageProvider {
  switch (device.kind) {
    case 'local-mount':
      return new LocalMountStorageProvider(device.mountPath ?? '');
    case 's3':
      return new S3StorageProvider(device);
    default:
      throw new StorageError('UNSUPPORTED_KIND', `unknown storage device kind: ${String((device as { kind?: unknown }).kind)}`);
  }
}