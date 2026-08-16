import { NODE_TYPES, CATEGORY_ORDER } from '../nodes/registry';

export interface MenuPick {
  type: string;
  x: number;
  y: number;
}

/** Context menu for adding nodes. Calls onPick(type, screenX, screenY). */
export function showAddNodeMenu(
  screenX: number,
  screenY: number,
  onPick: (type: string) => void
): HTMLElement {
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'ctxmenu';
  menu.style.left = `${Math.min(screenX, window.innerWidth - 210)}px`;
  menu.style.top = `${Math.min(screenY, window.innerHeight - 380)}px`;

  for (const cat of CATEGORY_ORDER) {
    const items = NODE_TYPES.filter(n => n.category === cat);
    if (!items.length) continue;
    const catEl = document.createElement('div');
    catEl.className = 'ctx-cat';
    catEl.textContent = cat;
    menu.appendChild(catEl);
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'ctx-item';
      const dot = document.createElement('span');
      dot.className = 'pal-dot';
      dot.style.background = item.color;
      el.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = item.title;
      el.appendChild(label);
      el.addEventListener('click', () => {
        onPick(item.type);
        closeMenus();
      });
      menu.appendChild(el);
    }
  }

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('pointerdown', onDocDown, { once: true });
  });
  return menu;
}

function onDocDown(e: PointerEvent) {
  const menu = document.querySelector('.ctxmenu');
  if (menu && !menu.contains(e.target as Node)) closeMenus();
}

export function closeMenus() {
  document.querySelectorAll('.ctxmenu').forEach(m => m.remove());
}

/** Build the left node palette with drag support and a live search filter. */
export function buildPalette(container: HTMLElement) {
  container.textContent = '';

  const search = document.createElement('input');
  search.className = 'pal-search';
  search.type = 'text';
  search.placeholder = '🔍 Search nodes…';
  container.appendChild(search);

  const list = document.createElement('div');
  list.className = 'pal-list';
  container.appendChild(list);

  const renderList = (query: string) => {
    list.textContent = '';
    const q = query.trim().toLowerCase();
    for (const cat of CATEGORY_ORDER) {
      const items = NODE_TYPES.filter(n => n.category === cat && (
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.type.includes(q)
      ));
      if (!items.length) continue;
      const catEl = document.createElement('div');
      catEl.className = 'pal-category';
      catEl.textContent = cat;
      list.appendChild(catEl);
      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'pal-item';
        el.draggable = true;
        const dot = document.createElement('span');
        dot.className = 'pal-dot';
        dot.style.background = item.color;
        el.appendChild(dot);
        const label = document.createElement('span');
        label.textContent = item.title;
        el.appendChild(label);
        el.addEventListener('dragstart', e => {
          e.dataTransfer?.setData('text/tf-node', item.type);
          e.dataTransfer!.dropEffect = 'copy';
        });
        list.appendChild(el);
      }
    }
    if (!list.childElementCount) {
      const none = document.createElement('div');
      none.className = 'pal-empty';
      none.textContent = 'No matching nodes';
      list.appendChild(none);
    }
  };

  search.addEventListener('input', () => renderList(search.value));
  renderList('');
}
