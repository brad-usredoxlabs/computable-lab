/**
 * createStorageProvider — factory from a StorageDeviceConfig to a concrete
 * StorageProvider.
 *
 * `local-mount` needs no external SDK (pure Node fs). `s3` is supported via a
 * lazy-imported provider so local-only installs stay SDK-free and startup cost
 * is zero when no S3 device is configured. The s3 branch is wired in Task 1.2;
 * until then an explicit error surfaces so misconfig is never silent.
 */
import { LocalMountStorageProvider } from './LocalMountStorageProvider.js';
import { StorageError, type StorageDeviceConfig, type StorageProvider } from './types.js';

export function createStorageProvider(device: StorageDeviceConfig): StorageProvider {
  switch (device.kind) {
    case 'local-mount':
      return new LocalMountStorageProvider(device.mountPath ?? '');
    case 's3':
      throw new StorageError(
        'UNSUPPORTED_KIND',
        `s3 storage provider for device "${device.id}" is not yet available (Task 1.2)`,
      );
    default:
      throw new StorageError('UNSUPPORTED_KIND', `unknown storage device kind: ${String((device as { kind?: unknown }).kind)}`);
  }
}