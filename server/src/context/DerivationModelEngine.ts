/**
 * DerivationModelEngine — interprets YAML derivation-model worksheets.
 * See compiler-specs/70-derivation-models.md and compiler-specs/30 §10.
 */

interface DerivationModelInput {
  name: string;
  type: string;
  required?: boolean;
}

interface DerivationModelStep {
  op: string;
  [k: string]: unknown;
}

export interface DerivationModel {
  id: string;
  version: number;
  inputs: DerivationModelInput[];
  output: { name: string; type: string };
  steps: DerivationModelStep[];
}

const SUPPORTED_OPS = new Set(['sum', 'union_components', 'divide', 'assign']);

export class DerivationModelEngine {
  /**
   * Execute a derivation model against the given inputs.
   * Returns a record keyed by the model's declared output.name plus any
   * intermediate names written by steps.
   */
  run(model: DerivationModel, inputs: Record<string, unknown>): Record<string, unknown> {
    this.validateInputs(model, inputs);
    const scratch: Record<string, unknown> = { ...inputs };
    for (const step of model.steps) {
      if (!SUPPORTED_OPS.has(step.op)) {
        throw new Error(`Unsupported derivation op: ${step.op}`);
      }
      this.applyStep(step, scratch);
    }
    return scratch;
  }

  private validateInputs(model: DerivationModel, inputs: Record<string, unknown>): void {
    for (const decl of model.inputs) {
      const required = decl.required !== false;
      if (required && inputs[decl.name] === undefined) {
        throw new Error(`DerivationModelEngine: missing required input '${decl.name}' for model ${model.id}`);
      }
    }
  }

  private applyStep(step: DerivationModelStep, scratch: Record<string, unknown>): void {
    switch (step.op) {
      case 'sum':
        this.applySum(step, scratch);
        break;
      case 'union_components':
        this.applyUnionComponents(step, scratch);
        break;
      case 'divide':
        this.applyDivide(step, scratch);
        break;
      case 'assign':
        this.applyAssign(step, scratch);
        break;
    }
  }

  private applySum(step: DerivationModelStep, scratch: Record<string, unknown>): void {
    const lhs = this.readPath(scratch, step.lhs as string);
    const rhs = this.readPath(scratch, step.rhs as string);
    if (typeof lhs !== 'number' || typeof rhs !== 'number') {
      throw new Error(`sum: both operands must be numbers (${step.lhs} + ${step.rhs})`);
    }
    this.writePath(scratch, step.into as string, lhs + rhs);
  }

  private applyDivide(step: DerivationModelStep, scratch: Record<string, unknown>): void {
    // Path with [*] means: for each element in the array at the path prefix, divide by rhs.
    const lhsPath = step.lhs as string;
    const rhsVal = this.readPath(scratch, step.rhs as string);
    const intoPath = step.into as string;
    if (typeof rhsVal !== 'number' || rhsVal === 0) {
      throw new Error(`divide: rhs must be non-zero number (got ${rhsVal})`);
    }
    if (!lhsPath.includes('[*]')) {
      const lhsVal = this.readPath(scratch, lhsPath);
      if (typeof lhsVal !== 'number') throw new Error(`divide: lhs must be number`);
      this.writePath(scratch, intoPath, lhsVal / rhsVal);
      return;
    }
    // Broadcast divide across an array.
    const lhsSepIndex = lhsPath.indexOf('[*].');
    const intoSepIndex = intoPath.indexOf('[*].');
    if (lhsSepIndex === -1 || intoSepIndex === -1) {
      throw new Error(`divide: invalid broadcast path format (${lhsPath} vs ${intoPath})`);
    }
    const arrPath = lhsPath.substring(0, lhsSepIndex);
    const lhsLeaf = lhsPath.substring(lhsSepIndex + 4);
    const arrPathInto = intoPath.substring(0, intoSepIndex);
    const intoLeaf = intoPath.substring(intoSepIndex + 4);
    if (arrPath !== arrPathInto) {
      throw new Error(`divide: broadcast lhs path and into path must share array prefix (${lhsPath} vs ${intoPath})`);
    }
    const arr = this.readPath(scratch, arrPath) as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(arr)) {
      throw new Error(`divide: path '${arrPath}' did not resolve to an array`);
    }
    for (const item of arr) {
      const v = this.readSimple(item, lhsLeaf);
      if (typeof v === 'number') {
        this.writeSimple(item, intoLeaf, v / rhsVal);
      }
    }
  }

  private applyUnionComponents(step: DerivationModelStep, scratch: Record<string, unknown>): void {
    const lhsArr = (this.readPath(scratch, step.lhs as string) ?? []) as Array<Record<string, unknown>>;
    const rhsArr = (this.readPath(scratch, step.rhs as string) ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(lhsArr) || !Array.isArray(rhsArr)) {
      throw new Error(`union_components: both sides must be arrays`);
    }
    const merged = new Map<string, Record<string, unknown>>();
    const keyOf = (c: Record<string, unknown>) => {
      const ref = c.material_ref as { id?: string } | undefined;
      return ref?.id ?? JSON.stringify(ref ?? {});
    };
    const addMass = (acc: Record<string, unknown>, c: Record<string, unknown>) => {
      const accMass = ((acc.mass as { value?: number } | undefined)?.value) ?? 0;
      const cMass = ((c.mass as { value?: number } | undefined)?.value) ?? 0;
      const accVol = ((acc.volume as { value?: number } | undefined)?.value) ?? 0;
      const cVol = ((c.volume as { value?: number } | undefined)?.value) ?? 0;
      const unit =
        ((acc.mass as { unit?: string } | undefined)?.unit) ??
        ((c.mass as { unit?: string } | undefined)?.unit);
      if (accMass + cMass > 0 && unit) {
        acc.mass = { value: accMass + cMass, unit };
      }
      if (accVol + cVol > 0) {
        const volUnit = ((acc.volume as { unit?: string } | undefined)?.unit) ??
          ((c.volume as { unit?: string } | undefined)?.unit) ?? '';
        acc.volume = { value: accVol + cVol, unit: volUnit };
      }
      if (c.material_ref && !acc.material_ref) acc.material_ref = c.material_ref;
    };
    for (const c of lhsArr) {
      const k = keyOf(c);
      merged.set(k, { ...c });
    }
    for (const c of rhsArr) {
      const k = keyOf(c);
      if (merged.has(k)) addMass(merged.get(k)!, c);
      else merged.set(k, { ...c });
    }
    this.writePath(scratch, step.into as string, Array.from(merged.values()));
  }

  private applyAssign(step: DerivationModelStep, scratch: Record<string, unknown>): void {
    const value = step.value !== undefined
      ? step.value
      : this.readPath(scratch, step.from as string);
    this.writePath(scratch, step.into as string, value);
  }

  private readPath(root: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let cur: unknown = root;
    for (const p of parts) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
      else return undefined;
    }
    return cur;
  }

  private writePath(root: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      if (!(key in cur) || typeof cur[key] !== 'object' || cur[key] === null) {
        cur[key] = {};
      }
      cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]!] = value;
  }

  private readSimple(obj: Record<string, unknown>, leaf: string): unknown {
    const parts = leaf.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
      else return undefined;
    }
    return cur;
  }

  private writeSimple(obj: Record<string, unknown>, leaf: string, value: unknown): void {
    const parts = leaf.split('.');
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      if (!(key in cur) || typeof cur[key] !== 'object' || cur[key] === null) {
        cur[key] = {};
      }
      cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]!] = value;
  }
}
