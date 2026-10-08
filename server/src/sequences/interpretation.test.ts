import { describe, expect, it } from 'vitest';
import { evaluatePredicate } from '../lint/PredicateEvaluator.js';
import type { Predicate } from '../lint/types.js';
describe('declarative numerical evidence criteria',()=>{
 it('compares measured numbers without coercing missing or textual values',()=>{
  const criterion={op:'compare',path:'result.ct',operator:'lte',value:30} as unknown as Predicate;
  expect(evaluatePredicate(criterion,{result:{ct:28}}).result).toBe(true);
  expect(evaluatePredicate(criterion,{result:{ct:32}}).result).toBe(false);
  expect(evaluatePredicate(criterion,{result:{ct:'28'}}).result).toBe(false);
  expect(evaluatePredicate(criterion,{result:{}}).result).toBe(false);
 });
});
