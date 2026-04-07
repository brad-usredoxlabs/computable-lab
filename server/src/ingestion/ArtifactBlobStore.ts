import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact.bin';
}

export class ArtifactBlobStore {
  constructor(
    private readonly workspaceRoot: string,
    private readonly storageRootRelative: string,
  ) {}

  private absolutePath(relativePath: string): string {
    return join(this.workspaceRoot, relativePath);
  }

  async save(args: {
    artifactId: string;
    fileName?: string;
    contentBase64: string;
  }): Promise<{ storedPath: string; sha256: string; sizeBytes: number }> {
    const fileName = safeName(args.fileName ?? `${args.artifactId}.bin`);
    const storedPath = join(this.storageRootRelative, args.artifactId, fileName);
    const absolutePath = this.absolutePath(storedPath);
    const buffer = Buffer.from(args.contentBase64, 'base64');
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
    return {
      storedPath,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.byteLength,
    };
  }

  async loadBase64(storedPath: string): Promise<string> {
    const buffer = await readFile(this.absolutePath(storedPath));
    return buffer.toString('base64');
  }
}
