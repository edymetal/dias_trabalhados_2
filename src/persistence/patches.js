import { clone } from './schema.js';

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

function sameContainerType(left, right) {
  return isContainer(left) && isContainer(right) && Array.isArray(left) === Array.isArray(right);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createPatchMap(before, after) {
  const patches = {};

  function visit(previous, next, path) {
    if (sameValue(previous, next)) return;

    if (previous === undefined) {
      if (path) patches[path] = clone(next);
      else Object.keys(next || {}).forEach(key => visit(undefined, next[key], key));
      return;
    }
    if (next === undefined) {
      patches[path] = null;
      return;
    }
    if (!sameContainerType(previous, next)) {
      patches[path] = clone(next);
      return;
    }

    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    if (keys.size === 0 && path) {
      patches[path] = clone(next);
      return;
    }
    for (const key of keys) {
      visit(previous[key], next[key], path ? `${path}/${key}` : key);
    }
  }

  visit(before ?? {}, after ?? {}, '');
  return patches;
}

function setPath(target, path, value) {
  const parts = path.split('/');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index];
    const nextPart = parts[index + 1];
    if (!isContainer(cursor[part])) cursor[part] = /^\d+$/.test(nextPart) ? [] : {};
    cursor = cursor[part];
  }

  const last = parts.at(-1);
  if (value === null) {
    if (Array.isArray(cursor)) delete cursor[Number(last)];
    else delete cursor[last];
  } else {
    cursor[last] = clone(value);
  }
}

function trimArrays(value) {
  if (!isContainer(value)) return;
  if (Array.isArray(value)) {
    while (value.length > 0 && value.at(-1) === undefined) value.pop();
  }
  Object.values(value).forEach(trimArrays);
}

export function applyPatchMap(value, patches) {
  const result = clone(value ?? {});
  for (const [path, patchValue] of Object.entries(patches || {})) {
    if (!path) continue;
    setPath(result, path, patchValue);
  }
  trimArrays(result);
  return result;
}
