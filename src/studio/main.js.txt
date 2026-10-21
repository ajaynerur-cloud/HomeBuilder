// Entry point: adds the Planner / Studio / Forge / Field / Kiln / Facet switch to the page and starts each workspace the first time it is opened.
import { createStudio } from './ui/studio.js';
import { createDuctile } from '../ductile/ui.js';
import { setupPlanWorkspace } from './planspace.js';

let studio = null, ductile = null;
function start() {
  const nav = document.getElementById('topnav'), planner = document.querySelector('.app');
  const roots = { studio: document.getElementById('studioRoot'), ductile: document.getElementById('ductileRoot') };
  if (!nav || !planner || !roots.studio) return;
  try { window.__planspace = setupPlanWorkspace(); } catch (e) { console.error(e); }
  function show(view) {
    // Forge and Kiln now live inside Ductile as workspaces; old links still work
    const inDuctile = { forge: 'forge', kiln: 'vessel', field: 'field', part: 'part' }[view]; if (inDuctile) { show('ductile'); if (ductile) ductile.app.setWorkspace(inDuctile); return; }
    if (view !== 'planner' && window.__planspace && window.__planspace.isOpen) window.__planspace.close();
    planner.hidden = view !== 'planner';
    Object.keys(roots).forEach((k) => { if (roots[k]) roots[k].hidden = view !== k; });
    Array.prototype.forEach.call(nav.querySelectorAll('button'), (b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === view)));
    if (view === 'studio') {
      if (studio) { studio.app.view2d.resize(); if (studio.app.view3d.ok) studio.app.view3d.resize(); }
      else { try { studio = createStudio(roots.studio); window.__studio = studio; } catch (e) { console.error(e); roots.studio.textContent = 'Studio could not start: ' + e.message; } }
    }
    if (view === 'ductile' && roots.ductile) {
      if (ductile) { ductile.view.resize(); ductile.app.refresh(); if (ductile.app.part) ductile.app.part.resize(); }
      else { try { ductile = createDuctile(roots.ductile); window.__ductile = ductile; } catch (e) { console.error(e); roots.ductile.textContent = 'Ductile could not start: ' + e.message; } }
    }
    try { history.replaceState(null, '', view === 'planner' ? location.pathname + location.search : '#' + view); } catch (e) { /* sandboxed page */ }
    window.scrollTo(0, 0);
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button[data-view]'); if (b) show(b.getAttribute('data-view')); });
  if (location.hash === '#studio') show('studio'); else if (location.hash === '#forge') show('forge'); else if (location.hash === '#field') show('field'); else if (location.hash === '#kiln') show('kiln'); else if (location.hash === '#ductile') show('ductile');
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start(); }
export { start };
