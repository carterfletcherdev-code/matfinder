'use client';

// Persists the scroll position of every [data-gym-list] container on the
// map page across navigations. When the user clicks "View full page →"
// to open a gym detail page and then taps the browser back button, the
// list returns to where they left off instead of resetting to the top.
//
// Strategy:
//   - On mount, restore scrollTop for each list from sessionStorage
//   - On scroll, debounce-save scrollTop back to sessionStorage
//   - Polls briefly after mount because the gym-list elements render
//     asynchronously (gyms load via fetch after first paint)
//
// Mounts as null — purely a side-effect component.

import { useEffect } from 'react';

const STORAGE_KEY = 'matfinder.list.scrollTop';
const DEBOUNCE_MS = 200;
const POLL_INTERVAL_MS = 200;
const POLL_DEADLINE_MS = 3000;

export default function ListScrollRestore() {
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let attached = false;
    let cleanupListeners: Array<() => void> = [];

    const attach = () => {
      const lists = document.querySelectorAll<HTMLElement>('[data-gym-list]');
      if (lists.length === 0 || attached) return;
      attached = true;

      // Restore — read once, apply to each visible list. Hidden lists
      // (inactive viewport variants) just get a scrollTop assignment
      // that's harmless when they're not rendered.
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const tops = JSON.parse(saved) as number[];
          lists.forEach((el, i) => {
            const t = tops[i];
            if (typeof t === 'number' && t > 0) {
              // requestAnimationFrame so layout has settled
              requestAnimationFrame(() => { el.scrollTop = t; });
            }
          });
        }
      } catch { /* swallow malformed JSON */ }

      // Save on scroll — debounced so we don't write on every pixel
      const onScroll = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          try {
            const tops = Array.from(lists).map(el => el.scrollTop);
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tops));
          } catch { /* private mode etc — silent */ }
        }, DEBOUNCE_MS);
      };

      lists.forEach(el => {
        el.addEventListener('scroll', onScroll, { passive: true });
        cleanupListeners.push(() => el.removeEventListener('scroll', onScroll));
      });
    };

    // Try once immediately, then poll briefly until the list mounts
    // (the map page fetches gyms async, so the list isn't in the DOM
    // on first useEffect tick).
    attach();
    const pollHandle = setInterval(attach, POLL_INTERVAL_MS);
    const deadline = setTimeout(() => clearInterval(pollHandle), POLL_DEADLINE_MS);

    return () => {
      clearInterval(pollHandle);
      clearTimeout(deadline);
      if (saveTimer) clearTimeout(saveTimer);
      cleanupListeners.forEach(fn => fn());
    };
  }, []);

  return null;
}
