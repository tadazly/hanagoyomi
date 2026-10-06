const paths = {
  github: '<path d="M9 21v-3.4c-4 .9-4-2-5-2.5m13 5.9v-3.4a3 3 0 0 0-.8-2.3c2.8-.3 5.8-1.4 5.8-6.2a4.8 4.8 0 0 0-1.3-3.3 4.5 4.5 0 0 0-.1-3.3s-1.1-.4-3.6 1.3a12 12 0 0 0-6 0C8.5 2.1 7.4 2.5 7.4 2.5a4.5 4.5 0 0 0-.1 3.3A4.8 4.8 0 0 0 6 9.1c0 4.8 3 5.9 5.8 6.2a3 3 0 0 0-.8 2.3V21"/>',
  flower: '<g fill="none"><ellipse cx="12" cy="6" rx="3.1" ry="5"/><ellipse cx="12" cy="6" rx="3.1" ry="5" transform="rotate(72 12 12)"/><ellipse cx="12" cy="6" rx="3.1" ry="5" transform="rotate(144 12 12)"/><ellipse cx="12" cy="6" rx="3.1" ry="5" transform="rotate(216 12 12)"/><ellipse cx="12" cy="6" rx="3.1" ry="5" transform="rotate(288 12 12)"/></g>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  'eye-off': '<path d="m3 3 18 18M10.6 5.2 12 5c5 0 9 7 9 7a20 20 0 0 1-3.1 3.8M6.2 6.3C3.9 8.2 3 12 3 12s4 7 9 7a10 10 0 0 0 4-.9M10 10a3 3 0 0 0 4 4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  sliders: '<path d="M4 6h7m5 0h4M4 12h2m5 0h9M4 18h10m5 0h1"/><circle cx="13.5" cy="6" r="2.5"/><circle cx="8.5" cy="12" r="2.5"/><circle cx="16.5" cy="18" r="2.5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  history: '<path d="M3 7v5h5M3.6 11a8.5 8.5 0 1 1 1.5 6M12 7v5l3 2"/>',
  sunrise: '<path d="M3 18h18M2 21h20M6 15a6 6 0 0 1 12 0M12 1v5m-8 1 2 2m14-2-2 2M2 14h2m16 0h2"/>',
  sunset: '<path d="M3 18h18M2 21h20M6 15a6 6 0 0 1 12 0M12 1v5m-8 1 2 2m14-2-2 2M2 14h2m16 0h2m-12-5 2 2 2-2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 4v5h-5M4 20v-5h5M4.8 9a8 8 0 0 1 13.4-4L20 9M4 15l1.8 4A8 8 0 0 0 19.2 15"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v6m-6 0h12"/>',
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
};

export function populateIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[el.dataset.icon] || ''}</svg>`;
  });
}
