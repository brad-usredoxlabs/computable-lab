import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access, open } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { AppContext } from '../server.js';
import type { OutputManifest } from '../analysis/analysisRunner.js';
import { RecordRevisionService } from '../revisions/RecordRevisionService.js';
import { virtualPcr, parseFasta, type AlphabetSpec, type PcrParameters, type Template } from './sequenceEngine.js';
const exec = promisify(execFile);
export const SEQUENCE_SCHEMA = 'https://computable-lab.com/schema/bio/';
export async function sequenceConfig(name: string): Promise<Record<string, any>> {
  return parse(await readFile(fileURLToPath(new URL(`../../../config/sequence-analysis/${name}.yaml`, import.meta.url)), 'utf8')) as Record<string, any>;
}
export interface Endpoint {
  engine: string; runtime: 'builtin'|'local'|'container'; version: string; executable?: string;
  executableSha256?: string; databaseBuilder?: string; databaseBuilderSha256?: string;
  engineSha256?: string;
  image?: string; timeoutSeconds: number; threads: number;
}
export async function builtinEngineHash(): Promise<string> {
  let bytes: Buffer;
  try { bytes=await readFile(new URL('./sequenceEngine.js',import.meta.url)); } catch { bytes=await readFile(new URL('./sequenceEngine.ts',import.meta.url)); }
  const alphabets=await readFile(new URL('../../../config/sequence-analysis/alphabets.yaml',import.meta.url));
  return createHash('sha256').update(bytes).update(alphabets).digest('hex');
}
export async function binaryHash(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Executable paths must be absolute.');
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
async function command(endpoint: Endpoint, args: string[], dir?: string, builder = false, version = false): Promise<string> {
  const executable = builder ? endpoint.databaseBuilder : endpoint.executable;
  if (endpoint.runtime === 'container') {
    if (!endpoint.image?.match(/@sha256:[a-f0-9]{64}$/)) throw new Error('Container image must be pinned by digest.');
    const flags = ['run','--pull','never','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev'];
    if (dir) flags.push('--mount', `type=bind,src=${dir},dst=${dir}`, '--workdir', dir);
    const tool = builder ? 'makeblastdb' : endpoint.engine;
    const result = await exec('docker', [...flags, '--entrypoint', tool, endpoint.image, ...args], { timeout: endpoint.timeoutSeconds*1000, maxBuffer: 64*1024*1024 });
    return version ? result.stdout || result.stderr : result.stdout;
  }
  if (!executable) throw new Error('Local executable is not configured.');
  const expected = builder ? endpoint.databaseBuilderSha256 : endpoint.executableSha256;
  if (await binaryHash(executable) !== expected) throw new Error('Executable checksum changed. Review and configure a new endpoint revision.');
  // MAFFT reopens /dev/stderr internally; Node's default socket cannot be reopened.
  // A regular diagnostic file also keeps progress messages out of FASTA output.
  if(endpoint.engine==='mafft' && dir) {
    const diagnostics=join(dir,'mafft-stderr.log');const fd=await open(diagnostics,'w');
    try {
      return await new Promise<string>((resolve,reject)=>{
        const child=spawn(executable,args,{cwd:dir,stdio:['ignore','pipe',fd.fd],timeout:endpoint.timeoutSeconds*1000});
        const chunks:Buffer[]=[];let bytes=0;let overflow=false;
        child.stdout!.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>64*1024*1024){overflow=true;child.kill();}else chunks.push(chunk);});
        child.on('error',reject);
        child.on('close',async code=>{if(code===0&&!overflow)resolve(Buffer.concat(chunks).toString('utf8'));else reject(new Error(overflow?'Alignment output exceeds 64 MB.':`MAFFT failed (${code}): ${(await readFile(diagnostics,'utf8')).slice(-4000)}`));});
      });
    } finally {await fd.close();}
  }
  const result = await exec(executable, args, { timeout: endpoint.timeoutSeconds*1000, maxBuffer: 64*1024*1024, ...(dir ? { cwd: dir } : {}) });
  return version ? result.stdout || result.stderr : result.stdout;
}
export async function inspectEndpoint(endpoint: Endpoint): Promise<{ ready: boolean; versionOutput: string }> {
  const config = await sequenceConfig('capabilities');
  const engine = config.engines.find((x: {id: string}) => x.id === endpoint.engine);
  if (!engine) throw new Error('Unknown sequence engine.');
  if (!engine.runtime.includes(endpoint.runtime)) throw new Error('Unsupported runtime for this engine.');
  if (endpoint.runtime === 'builtin') {
    if(endpoint.engineSha256 && endpoint.engineSha256 !== await builtinEngineHash()) throw new Error('The built-in engine changed. Configure a new endpoint before running it.');
    if (endpoint.version !== engine.version) throw new Error(`Installed engine version is ${engine.version}.`);
    return { ready: true, versionOutput: engine.version };
  }
  const versionOutput = await command(endpoint, engine.versionArgs, undefined, false, true);
  if (!versionOutput.includes(endpoint.version)) throw new Error(`Configured version ${endpoint.version} does not match executable: ${versionOutput.slice(0,300)}`);
  if (endpoint.engine === 'blastn') { const builderVersion=await command(endpoint, ['-version'], undefined, true, true); if(!builderVersion.includes(endpoint.version))throw new Error('makeblastdb must match the configured BLAST version.'); }
  return { ready: true, versionOutput: versionOutput.trim() };
}
/** Resolve only immutable revisions; collection and oligo members are pinned at authoring. */
export async function resolveSequences(ctx: AppContext, ref: {id: string}, seen = new Set<string>()): Promise<Template[]> {
  if (seen.has(ref.id)) throw new Error('Cyclic sequence collection.');
  const next = new Set(seen); next.add(ref.id);
  const revision = await new RecordRevisionService(ctx.store).read(ref);
  const p = revision.payload.snapshot;
  if (p.kind === 'sequence') return [{ id: revision.payload.sourceRecordId, revisionId:revision.recordId, alphabet:String(p.alphabet), residues: String(p.residues), topology: String(p.topology ?? 'linear') }];
  if (p.kind === 'oligo-spec') return resolveSequences(ctx, p.sequenceRef as {id:string}, next);
  if (p.kind === 'sequence-collection') {
    const members = await Promise.all((p.members as Array<{id:string}>).map(r => resolveSequences(ctx,r,next)));
    return members.flat();
  }
  throw new Error(`Expected a sequence, oligo or collection revision; got ${String(p.kind)}.`);
}
export async function executeSequenceMethod(ctx: AppContext, method: Record<string, any>, inputs: Record<string, {id:string}>, parameters: Record<string, unknown>, dir: string): Promise<OutputManifest> {
  const revisions = new RecordRevisionService(ctx.store);
  const endpoint = (await revisions.read(method.endpointRevisionRef)).payload.snapshot as unknown as Endpoint;
  await inspectEndpoint(endpoint);
  const op = String(method.operation);
  if (endpoint.engine !== op) throw new Error('Method engine differs from its pinned endpoint.');
  const limits=(await sequenceConfig('capabilities')).limits;
  const checkSize=(sequences:Template[])=>{if(sequences.length>limits.maxSequenceCount || sequences.reduce((n,s)=>n+s.residues.length,0)>limits.maxReferenceResidues)throw new Error('Reference collection exceeds this endpoint workload limit. Review the workload limits in the sequence analysis configuration.');};
  const manifest: OutputManifest = { version:1, artifacts:[], views:[], metrics:[], logs:[] };
  const publish = (name: string, dataKind: string, value: unknown, renderer = 'table') => {
    manifest.artifacts.push({ name, dataKind, value }); manifest.views.push({name,renderer,artifact:name});
  };
  if (op === 'virtual-pcr') {
    const alphabets = await sequenceConfig('alphabets');
    const [references, forward, reverse, probe] = await Promise.all([
      resolveSequences(ctx,inputs.references!),resolveSequences(ctx,inputs.forward!),resolveSequences(ctx,inputs.reverse!),
      inputs.probe ? resolveSequences(ctx,inputs.probe) : Promise.resolve([]),
    ]);
    checkSize(references);
    if([...references,...forward,...reverse,...probe].some(q=>alphabets[q.alphabet!]?.family!=='dna'))throw new Error('Virtual PCR requires DNA sequences.');
    if([...forward,...reverse,...probe].some(x=>x.residues.length>limits.maxOligoResidues))throw new Error('Oligo exceeds the configured size limit.');
    if (forward.length !== 1 || reverse.length !== 1 || probe.length > 1) throw new Error('Select one sequence for each primer and probe.');
    const products = virtualPcr(references,forward[0]!.residues,reverse[0]!.residues,probe[0]?.residues,parameters as unknown as PcrParameters,alphabets.iupac_dna as AlphabetSpec);
    publish('amplicons','sequence-hits',products);
    manifest.logs.push({level:'info',message:'Computational prediction. Ambiguous reference bases match only when all possibilities are covered by the oligo; probe sites are exact and internal to the primers.'});
  } else {
    const queries = await resolveSequences(ctx,inputs.queries!);
    checkSize(queries);
    const alphabets=await sequenceConfig('alphabets');
    const families=new Set(queries.map(q=>alphabets[q.alphabet!]?.family));
    if(families.size!==1 || families.has(undefined))throw new Error('Select sequences from one declared alphabet family.');
    if(op==='blastn' && !families.has('dna'))throw new Error('Nucleotide BLAST requires DNA sequences; explicitly convert RNA before this analysis.');
    const labels = queries.map((q,i) => ({ key:`q${i}`, ...q }));
    const queryFile = join(dir,'queries.fasta');
    await writeFile(queryFile,labels.map(q => `>${q.key}\n${q.residues}\n`).join(''));
    if (op === 'mafft') {
      const strategy = String(parameters.strategy);
      const args = [families.has('protein')?'--amino':'--nuc','--thread',String(endpoint.threads),'--threadit','0'];
      args.push(`--${strategy}`);
      if (strategy !== 'auto') args.push('--maxiterate',String(parameters.maxIterations));
      args.push(queryFile);
      const alignment = parseFasta(await command(endpoint,args,dir)).map(row => {
        const original = labels.find(q => q.key === row.label.split(/\s/)[0]);
        if (!original) throw new Error('Alignment returned an unknown sequence identifier.');
        let coordinate = 0;
        const coordinateMap = [...row.residues].map(x => x === '-' ? null : ++coordinate);
        if (row.residues.replace(/-/g,'').toUpperCase() !== original.residues) throw new Error('Alignment changed sequence residues.');
        return { sequenceId:original.id, revisionId:original.revisionId, aligned:row.residues, coordinateMap };
      });
      if (alignment.length !== queries.length || new Set(alignment.map(x=>x.aligned.length)).size !== 1) throw new Error('Incomplete or inconsistent alignment output.');
      publish('alignment','alignment',alignment);
    } else if (op === 'blastn') {
      const references = await resolveSequences(ctx,inputs.references!);
      checkSize(references);
      if(references.some(q=>alphabets[q.alphabet!]?.family!=='dna'))throw new Error('BLAST reference sequences must use a DNA alphabet.');
      const dbFile = join(dir,'references.fasta'); const db = join(dir,'reference-db');
      await writeFile(dbFile,references.map((q,i)=>`>r${i}\n${q.residues}\n`).join(''));
      await command(endpoint,['-in',dbFile,'-dbtype','nucl','-parse_seqids','-out',db],dir,true);
      const output = await command(endpoint,['-query',queryFile,'-db',db,'-task',String(parameters.task),'-evalue',String(parameters.evalue),'-max_target_seqs',String(parameters.maxHits),'-num_threads',String(endpoint.threads),'-outfmt','6 qseqid sseqid pident length qstart qend sstart send evalue bitscore qcovhsp'],dir);
      const hits = output.trim() ? output.trim().split(/\r?\n/).map(line => {
        const [q,s,...values] = line.split('\t'); const numbers = values.map(Number);
        if (numbers.length !== 9 || numbers.some(x=>!Number.isFinite(x))) throw new Error('Malformed BLAST output.');
        const query=labels.find(x=>x.key===q); const subject=references[Number(s?.replace(/^r/,''))];
        if (!query || !subject) throw new Error('BLAST returned an unknown sequence identifier.');
        return {queryId:query.id,queryRevisionId:query.revisionId,referenceId:subject.id,referenceRevisionId:subject.revisionId,identity:numbers[0],length:numbers[1],queryStart:numbers[2],queryEnd:numbers[3],subjectStart:numbers[4],subjectEnd:numbers[5],evalue:numbers[6],bitScore:numbers[7],coverage:numbers[8]};
      }) : [];
      publish('hits','sequence-hits',hits);
    } else throw new Error('Unknown analysis operation.');
  }
  manifest.logs.push({level:'info',message:`Engine ${endpoint.engine} ${endpoint.version}; runtime ${endpoint.runtime}; inputs and endpoint pinned to record revisions.`});
  return manifest;
}

/** Discovery reads the declared engine menu and returns concrete, checksum-pinned configurations. */
export async function discoverEndpoints(): Promise<Array<Record<string,unknown>>> {
  const config=await sequenceConfig('capabilities');const found:Array<Record<string,unknown>>=[];
  for(const engine of config.engines) {
    if(engine.runtime.includes('builtin')) {found.push({engine:engine.id,runtime:'builtin',version:engine.version,engineSha256:await builtinEngineHash()});continue;}
    for(const directory of (process.env.PATH??'').split(':').filter(Boolean)) {
      const path=join(directory,engine.id);
      try {
        await access(path,1);const hash=await binaryHash(path);
        const result=await exec(path,engine.versionArgs,{timeout:10000,maxBuffer:100000});
        const versionOutput=(result.stdout||result.stderr).trim();
        const configuration:Record<string,unknown>={engine:engine.id,runtime:'local',executable:path,executableSha256:hash,versionOutput};
        if(engine.id==='blastn') {const builder=join(directory,'makeblastdb');configuration.databaseBuilder=builder;configuration.databaseBuilderSha256=await binaryHash(builder);}
        found.push(configuration);break;
      } catch { /* Not an installed usable executable in this PATH entry. */ }
    }
  }
  return found;
}
export async function deployEndpoint(endpoint:Endpoint):Promise<void> {
  if(endpoint.runtime!=='container'||!endpoint.image?.match(/@sha256:[a-f0-9]{64}$/))throw new Error('Deployment requires a container image pinned by digest.');
  await exec('docker',['pull',endpoint.image],{timeout:endpoint.timeoutSeconds*1000,maxBuffer:10*1024*1024});
}
