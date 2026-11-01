/* 极简线性图标集（替代 lucide-react，零依赖） */
const icon = (children, opts = {}) =>
  function Icon({ size = 20, strokeWidth = opts.strokeWidth || 2.2, ...rest }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={opts.fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {children}
      </svg>
    );
  };

export const IconHome = icon(
  <>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
  </>
);

export const IconRefresh = icon(
  <>
    <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" />
    <path d="M20 20v-4h-4" />
  </>
);

export const IconBook = icon(
  <>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5" />
  </>
);

export const IconGraph = icon(
  <>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="18" cy="8" r="2.4" />
    <circle cx="11" cy="18" r="2.4" />
    <path d="M8.1 7.3 15.7 8" />
    <path d="M7.2 8.2 10 15.6" />
    <path d="M16.4 10.2 12.4 16" />
  </>
);

export const IconUniverse = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-24 12 12)" />
    <circle cx="19" cy="7" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="5.6" cy="16.6" r="1.1" fill="currentColor" stroke="none" />
  </>
);

export const IconChat = icon(
  <>
    <path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z" />
    <path d="M8.5 10h7M8.5 13.5h4" />
  </>
);

export const IconTrophy = icon(
  <>
    <path d="M7 4h10v4.5A5 5 0 0 1 7 8.5z" />
    <path d="M7 5.5H4.5v1A3.5 3.5 0 0 0 8 10" />
    <path d="M17 5.5h2.5v1A3.5 3.5 0 0 1 16 10" />
    <path d="M12 13.5V17" />
    <path d="M8.5 20.5h7" />
    <path d="M9.5 17h5l.7 3.5h-6.4z" />
  </>
);

export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);

export const IconMic = icon(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3" />
  </>
);

export const IconQuiz = icon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M8.5 9.5h7M8.5 14h4.5" />
  </>
);

export const IconFlame = icon(
  <path d="M12 3c.6 3 2.4 4.2 3.8 5.6A6.4 6.4 0 0 1 12 19a6 6 0 0 1-6-6c0-2.2 1.2-3.6 2.4-4.8C9.6 6.8 11 5.4 12 3z" />
);

export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </>
);

export const IconMenu = icon(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconClose = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const IconCheck = icon(<path d="m5 12.5 4.5 4.5L19 7" />);

export const IconChevronLeft = icon(<path d="m14.5 6-6 6 6 6" />);
export const IconChevronRight = icon(<path d="m9.5 6 6 6-6 6" />);
export const IconChevronDown = icon(<path d="m6 9.5 6 6 6-6" />);

export const IconCopy = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="3" />
    <path d="M15 6V5a1 1 0 0 0-1-1H5.5A1.5 1.5 0 0 0 4 5.5V15a1 1 0 0 0 1 1h1" />
  </>
);

export const IconTrash = icon(
  <>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5h5v2" />
    <path d="M6.5 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </>
);

export const IconEdit = icon(
  <>
    <path d="M4 20h4l10-10a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6z" />
    <path d="M14.5 6.5 17.5 9.5" />
  </>
);

export const IconStar = icon(
  <path d="m12 4 2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.4 7 19l1.1-5.5L4 9.7l5.6-.7z" />
);

export const IconUser = icon(
  <>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </>
);

export const IconSettings = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" />
  </>
);

export const IconDownload = icon(
  <>
    <path d="M12 4v11" />
    <path d="m7.5 11 4.5 4.5L16.5 11" />
    <path d="M5 20h14" />
  </>
);

export const IconUpload = icon(
  <>
    <path d="M12 19V8" />
    <path d="m7.5 12 4.5-4.5L16.5 12" />
    <path d="M5 4h14" />
  </>
);

export const IconLock = icon(
  <>
    <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    <path d="M12 14.5v2" />
  </>
);

export const IconLogout = icon(
  <>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H14" />
    <path d="M10 8 6 12l4 4" />
    <path d="M6 12h9" />
  </>
);

export const IconSend = icon(
  <>
    <path d="M4 12 20 4l-6.5 16-2.8-6.2z" />
    <path d="M10.7 13.8 20 4" />
  </>
);

export const IconVolume = icon(
  <>
    <path d="M5 10v4h3l4 3.5v-11L8 10z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
  </>
);

export const IconCalendar = icon(
  <>
    <rect x="4" y="5.5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3.5v3M15 3.5v3" />
  </>
);

export const IconTrend = icon(
  <>
    <path d="M4 17 9.5 11l3.5 3 6.5-6.5" />
    <path d="M15 7.5h4.5V12" />
  </>
);

export const IconLayers = icon(
  <>
    <path d="m12 4 8 4-8 4-8-4z" />
    <path d="m4 12 8 4 8-4" />
    <path d="m4 16 8 4 8-4" />
  </>
);

export const IconAlert = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v5M12 16.2v.1" />
  </>
);

export const IconCheckCircle = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.2 2.6 2.6 4.4-5" />
  </>
);

export const IconInfo = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.1" />
  </>
);

export const IconSparkles = icon(
  <>
    <path d="m12 4 1.5 4L18 9.5 13.5 11 12 15l-1.5-4L6 9.5 10.5 8z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </>
);

export const IconPlay = icon(<path d="M8 5.5 18 12 8 18.5z" />, { fill: true, strokeWidth: 1 });

export const IconCards = icon(
  <>
    <rect x="3.5" y="7" width="12" height="13" rx="3" />
    <path d="M7.5 5.5 16 4a2.6 2.6 0 0 1 3.2 2l1.4 8.6" />
  </>
);

export const IconTarget = icon(
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </>
);

export const IconClock = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3.2 2" />
  </>
);
