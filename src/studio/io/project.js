import { migrate } from '../model/schema.js';
export const STORAGE_KEY = 'chp_studio_v1';
export function serialize(project) { return JSON.stringify({ app: 'courtyard-studio', ...project }, null, 1); }
export function parseProject(text) {
  const o = JSON.parse(text);
  if (!o || typeof o !== 'object' || !Array.isArray(o.walls) && !Array.isArray(o.levels)) throw new Error('This is not a Studio project file.');
  delete o.app; return migrate(o);
}
export function loadSaved() { try { const t = localStorage.getItem(STORAGE_KEY); return t ? parseProject(t) : null; } catch (e) { return null; } }
export function save(project) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); return true; } catch (e) { return false; } }
