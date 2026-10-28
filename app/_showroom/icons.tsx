import type { ReactNode } from "react";

/** Small inline line icons (decorative; always `aria-hidden`). */
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ShowroomIcons = {
  envelope: (className?: string) => (
    <Icon className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </Icon>
  ),
  share: (className?: string) => (
    <Icon className={className}>
      <path d="M7 10.5a5 5 0 0 1 10 0c0 4-5 7.5-5 7.5s-1.4-.9-2.6-2.3" />
      <path d="M4 20c2-1 3-2.3 3.5-4" />
      <circle cx="12" cy="10.5" r="1.4" />
    </Icon>
  ),
  families: (className?: string) => (
    <Icon className={className}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M3 19c.6-3.2 2.6-5 5-5s4.4 1.8 5 5" />
      <path d="M13.5 18.5c.5-2.3 1.7-3.6 3.3-3.6 1.8 0 3 1.4 3.4 3.8" />
    </Icon>
  ),
  rsvp: (className?: string) => (
    <Icon className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </Icon>
  ),
  map: (className?: string) => (
    <Icon className={className}>
      <path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.3" />
    </Icon>
  ),
  gallery: (className?: string) => (
    <Icon className={className}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 3.5 3 2.5-2 5 3.5" />
    </Icon>
  ),
  guest: (className?: string) => (
    <Icon className={className}>
      <path d="M4 7.5h16v9H4z" />
      <path d="M7.5 11h5M7.5 13.5h3" />
      <path d="M16.5 10.5v3" />
    </Icon>
  ),
  support: (className?: string) => (
    <Icon className={className}>
      <path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1" />
      <rect x="3.5" y="13" width="4" height="5.5" rx="1.5" />
      <rect x="16.5" y="13" width="4" height="5.5" rx="1.5" />
    </Icon>
  ),
  check: (className?: string) => (
    <Icon className={className}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </Icon>
  ),
  arrow: (className?: string) => (
    <Icon className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  ),
  arrowLeft: (className?: string) => (
    <Icon className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  ),
  menu: (className?: string) => (
    <Icon className={className}>
      <path d="M4 8h16M4 16h16" />
    </Icon>
  ),
  lock: (className?: string) => (
    <Icon className={className}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Icon>
  ),
  phone: (className?: string) => (
    <Icon className={className}>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />
    </Icon>
  ),
  chat: (className?: string) => (
    <Icon className={className}>
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />
    </Icon>
  ),
};
