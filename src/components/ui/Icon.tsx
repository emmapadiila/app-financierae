export type IconName = 'home' | 'movements' | 'debt' | 'plan' | 'menu' | 'back' | 'next' | 'plus' | 'close' | 'moon' | 'sun' | 'check';
const paths: Record<IconName, string> = {
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
