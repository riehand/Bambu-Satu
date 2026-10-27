export function Icon({ name = "leaf", className = "" }: { name?: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    leaf: <><path d="M12 21V11M5 21h14M12 15C5 16 3 11 3 7c6-1 9 2 9 7M12 11c-1-7 4-10 9-9 0 6-3 10-9 9" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    clipboard: <><rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6m-6 5h6"/></>,
    chart: <><path d="M4 20v-5m5 5V9m5 11v-8m5 8V5M3 11l6-6 5 3 7-6"/></>,
    people: <><circle cx="10" cy="7" r="3"/><path d="M3 21v-4a7 7 0 0 1 14 0v4M17 4a3 3 0 0 1 0 6m3 11v-4a6 6 0 0 0-2-4"/></>,
    spark: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5ZM21 2v4m-2-2h4" />,
    shield: <><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>,
  };
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.leaf}</svg>;
}
export function Brand() { return <span className="wb-brand"><Icon />WellBeing Hub</span>; }
