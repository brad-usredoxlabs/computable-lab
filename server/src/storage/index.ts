/**
 * Storage module barrel — external storage devices (S3 bucket / NAS / USB).
 * Large raw data lives here, referenced from git records by pointer + hash.
 */
export * from './types.js';
export { StorageService } from './StorageService.js';
export type { PublicStorageDevice } from './StorageService.js';
export { createStorageProvider } from './createStorageProvider.js';
export { LocalMountStorageProvider } from './LocalMountStorageProvider.js';
export { S3StorageProvider } from './S3StorageProvider.js';
export type { S3ClientLike } from './S3StorageProvider.js';