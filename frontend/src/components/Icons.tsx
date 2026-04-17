import type { SVGProps } from "react";

type IconProps = {
  size?: number;
  className?: string;
  color?: string;
};

type BaseProps = IconProps & {
  children: React.ReactNode;
};

function IconBase({ size = 16, className, color, children }: BaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

const makeIcon = (children: SVGProps<SVGElement>["children"]) => {
  return function GeneratedIcon(props: IconProps) {
    return <IconBase {...props}>{children}</IconBase>;
  };
};

export const IconHome = makeIcon(<path d="M3 11.5 12 4l9 7.5M6 10v10h12V10" />);
export const IconDatabase = makeIcon(<><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /></>);
export const IconBrain = makeIcon(<><path d="M8 8a3 3 0 1 1 6 0" /><path d="M8 8c-2 0-3 1.3-3 3s1 3 3 3" /><path d="M14 8c2 0 3 1.3 3 3s-1 3-3 3" /><path d="M9 14v2m6-2v2m-3-5v7" /></>);
export const IconSearch = makeIcon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconBell = makeIcon(<><path d="M6 9a6 6 0 1 1 12 0v5l2 2H4l2-2z" /><path d="M10 19a2 2 0 0 0 4 0" /></>);
export const IconSettings = makeIcon(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.2-2-3.4-2.3.8a7 7 0 0 0-1.7-1L14.5 3h-5L9 5.2a7 7 0 0 0-1.7 1L5 5.4 3 8.8 5 10a7 7 0 0 0 0 2l-2 1.2 2 3.4 2.3-.8a7 7 0 0 0 1.7 1L9.5 21h5l.5-2.2a7 7 0 0 0 1.7-1l2.3.8 2-3.4L18.9 14c.1-.3.1-.7.1-1Z" /></>);
export const IconPlus = makeIcon(<path d="M12 5v14M5 12h14" />);
export const IconUpload = makeIcon(<><path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M5 19h14" /></>);
export const IconDownload = makeIcon(<><path d="M12 5v11" /><path d="m17 11-5 5-5-5" /><path d="M5 19h14" /></>);
export const IconPlay = makeIcon(<path d="m8 6 10 6-10 6z" />);
export const IconSave = makeIcon(<><path d="M5 4h12l2 2v14H5z" /><path d="M8 4v5h8V4" /><path d="M8 20v-5h8v5" /></>);
export const IconShare = makeIcon(<><circle cx="6" cy="12" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="18" cy="17" r="2" /><path d="m8 12 8-4M8 12l8 4" /></>);
export const IconTrash = makeIcon(<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /></>);
export const IconEdit = makeIcon(<><path d="m4 20 4.5-1 9-9-3.5-3.5-9 9L4 20z" /><path d="m13.5 6.5 3.5 3.5" /></>);
export const IconCheck = makeIcon(<path d="m5 12 4 4 10-10" />);
export const IconX = makeIcon(<path d="m6 6 12 12M18 6 6 18" />);
export const IconRefresh = makeIcon(<><path d="M20 4v6h-6" /><path d="M4 20v-6h6" /><path d="M20 10a8 8 0 0 0-14-4M4 14a8 8 0 0 0 14 4" /></>);
export const IconFilter = makeIcon(<path d="M4 6h16l-6 7v5l-4 2v-7z" />);
export const IconTable = makeIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M9 5v14M15 5v14" /></>);
export const IconBarChart = makeIcon(<><path d="M5 19V9" /><path d="M12 19V5" /><path d="M19 19v-7" /></>);
export const IconLayers = makeIcon(<><path d="m12 4 9 5-9 5-9-5 9-5z" /><path d="m3 14 9 5 9-5" /></>);
export const IconCode = makeIcon(<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />);
export const IconChevronDown = makeIcon(<path d="m6 9 6 6 6-6" />);
export const IconChevronUp = makeIcon(<path d="m6 15 6-6 6 6" />);
export const IconChevronRight = makeIcon(<path d="m9 6 6 6-6 6" />);
export const IconMoreHoriz = makeIcon(<><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>);
export const IconUser = makeIcon(<><circle cx="12" cy="8" r="4" /><path d="M4 20c1.8-3 4.6-4.5 8-4.5S18.2 17 20 20" /></>);
export const IconTeam = makeIcon(<><circle cx="8" cy="9" r="3" /><circle cx="16" cy="10" r="2.5" /><path d="M3 20c1.2-2.8 3.2-4.2 5.8-4.2" /><path d="M12 20c1-2.2 2.8-3.3 5-3.3" /></>);
export const IconClock = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconCopy = makeIcon(<><rect x="9" y="9" width="11" height="11" rx="2" /><rect x="4" y="4" width="11" height="11" rx="2" /></>);
export const IconZap = makeIcon(<path d="m13 2-9 12h6l-1 8 9-12h-6z" />);
export const IconCreditCard = makeIcon(<><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><path d="M7 14h3" /></>);
export const IconLogOut = makeIcon(<><path d="M14 16l4-4-4-4" /><path d="M18 12H9" /><path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" /></>);
export const IconMessageCircle = makeIcon(<><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5A8.2 8.2 0 0 1 8 19.2L3 21l1.7-4.5A8.2 8.2 0 0 1 3.5 12 8.5 8.5 0 1 1 21 12Z" /></>);
export const IconFileText = makeIcon(<><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4" /><path d="M9.5 12h7M9.5 16h7" /></>);
export const IconGrid = makeIcon(<><rect x="4" y="4" width="7" height="7" rx="1.2" /><rect x="13" y="4" width="7" height="7" rx="1.2" /><rect x="4" y="13" width="7" height="7" rx="1.2" /><rect x="13" y="13" width="7" height="7" rx="1.2" /></>);
export const IconShield = makeIcon(<><path d="M12 3 5 6v6c0 4.2 2.6 7.3 7 9 4.4-1.7 7-4.8 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>);
export const IconSend = makeIcon(<><path d="M3 12 21 4 15 20l-3.6-5.3L3 12Z" /><path d="M11.4 14.7 21 4" /></>);
export const IconGitBranch = makeIcon(<><path d="M6 3v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>);
export const IconSparkles = makeIcon(<><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /><circle cx="12" cy="12" r="4" /></>);
export const IconSortAsc = makeIcon(<><path d="M4 6h16M4 12h10M4 18h6" /><path d="m17 15 3 3 3-3" /><path d="M20 18v-6" /></>);
export const IconMerge = makeIcon(<><path d="M8 7v8a2 2 0 0 0 2 2h6" /><path d="M8 7V5" /><path d="M16 7V5" /><path d="M16 15l2 2-2 2" /><path d="M16 7a4 4 0 0 1 0 8" /></>);
