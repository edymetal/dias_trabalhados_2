import { describe, expect, it } from 'vitest';
import {
  assertSafeTestProject,
  EMULATOR_PROJECT_ID,
  PRODUCTION_PROJECT_ID
} from '../../src/firebase/config.js';

describe('proteção contra testes em produção', () => {
  it('aceita somente project IDs demo-*', () => {
    expect(() => assertSafeTestProject(EMULATOR_PROJECT_ID)).not.toThrow();
    expect(() => assertSafeTestProject('staging-real-project')).toThrow(/Projeto inseguro/);
  });

  it('bloqueia explicitamente o projeto de produção', () => {
    expect(() => assertSafeTestProject(PRODUCTION_PROJECT_ID)).toThrow(/Projeto inseguro/);
  });
});
