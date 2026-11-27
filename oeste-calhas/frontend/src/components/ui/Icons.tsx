import type { SVGProps } from "react";
type P = SVGProps<SVGSVGElement>;
const make = (d: React.ReactNode) => function Icon(p: P) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>;
};
export const IconCalendar = make(<><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
export const IconPin = make(<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0z" /><circle cx="12" cy="10" r="3" /></>);
export const IconPhone = make(<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" />);
export const IconChat = make(<path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z" />);
export const IconCheck = make(<path d="M20 6L9 17l-5-5" />);
export const IconX = make(<path d="M18 6L6 18M6 6l12 12" />);
export const IconRefresh = make(<><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15" /></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></>);
export const IconLogout = make(<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />);
export const IconInfo = make(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>);
export const IconAlert = make(<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01" />);
export const IconChevron = make(<path d="M9 18l6-6-6-6" />);
export const IconChevronL = make(<path d="M15 18l-6-6 6-6" />);
export const IconLock = make(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>);
export const IconGrid = make(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>);
export const IconUsers = make(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" /></>);
export const IconChart = make(<path d="M18 20V10M12 20V4M6 20v-6" />);
export const IconSliders = make(<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />);
export const IconList = make(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />);
export const IconDots = make(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconDownload = make(<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />);
export const IconGoogle = (p: P) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 01-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-8z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.300-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.800 1.1-2.900 0-5.400-2-6.300-4.600H2.100v2.800A11 11 0 0012 23z" />
    <path fill="#FBBC05" d="M5.700 14.100a6.600 6.600 0 010-4.200V7.100H2.100a11 11 0 000 9.800l3.600-2.800z" />
    <path fill="#EA4335" d="M12 5.400c1.600 0 3.100.6 4.200 1.700l3.100-3.100A11 11 0 002.100 7.100l3.600 2.800C6.600 7.400 9.100 5.400 12 5.400z" />
  </svg>
);
