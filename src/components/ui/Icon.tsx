export type IconName = 'home' | 'movements' | 'debt' | 'plan' | 'menu' | 'back' | 'next' | 'plus' | 'close' | 'moon' | 'sun' | 'check' | 'wallet' | 'cart' | 'energy' | 'water' | 'flame' | 'globe' | 'car' | 'education' | 'savings' | 'target' | 'calendar' | 'party' | 'rocket' | 'arrow-up' | 'arrow-down' | 'shield';
const paths: Record<IconName, string> = {
  wallet: 'M20 8H5a2 2 0 0 1 0-4h13v4M3 6v13a2 2 0 0 0 2 2h15V8M20 12h-6v5h6M16 14.5h.1',
  cart: 'M2 3h3l3 12h11l3-9H6M10 20h.1M18 20h.1M8 10h11M11 6v8m5-8v8',
  energy: 'm13 2-9 12h7l-1 8 10-13h-7z',
  water: 'M12 2C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-7-7-12Z',
  flame: 'M13 2c2 5-3 7-1 10 2-1 3-3 3-5 4 5 5 7 4 10a7 7 0 0 1-14-1c0-4 3-6 4-9 0 4 2 4 2 4s4-4 2-9Z',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18ZM5 7h14M5 17h14',
  car: 'm5 9 2-5h10l2 5M3 10h18v8H3zM5 18v3m14-3v3M6 13h2m8 0h2',
  education: 'm2 9 10-6 10 6-10 6-10-6Zm4 3v6c4 3 8 3 12 0v-6M22 9v8',
  savings: 'M5 9c2-5 9-6 13-2l3-1v5l2 1v5h-3l-1 4h-3l-1-3H9l-1 3H5l-1-5C0 15 1 10 5 11M9 7h5m3 4h.1',
  target: 'M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5M12 12 22 2M17 2v5h5',
  calendar: 'M3 5h18v16H3zM7 2v6m10-6v6M3 10h18M7 14h.1m4 0h.1m4 0h.1M7 17h.1m4 0h.1',
  party: 'm3 21 4-13 9 9-13 4Zm8-18 1 3m5 4 4 1m-3-8-3 5M8 14l3 3M19 16h.1M6 3h.1',
  rocket: 'M9 15c-3-5 3-12 12-12 0 9-7 15-12 12Zm-1-5H4l-2 5h7m5 1v4l-5 2v-7M5 18l-3 4m14-15h.1',
  'arrow-up': 'M12 20V4m-6 6 6-6 6 6', 'arrow-down': 'M12 4v16m-6-6 6 6 6-6',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-5 10 3 3 7-7',
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  movements: 'M9 4H6a2 2 0 0 0-2 2v14h16V6a2 2 0 0 0-2-2h-3M9 2h6v5H9z',
  debt: 'M3 5h18v14H3zM3 10h18M7 15h3m4 0h3',
  plan: 'M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  back: 'm15 5-7 7 7 7', next: 'm9 5 7 7-7 7', plus: 'M12 4v16M4 12h16', close: 'm6 6 12 12M6 18 18 6',
  moon: 'M20 14A8 8 0 0 1 10 4a9 9 0 1 0 10 10', sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', check: 'm5 12 4 4L19 6',
};
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
