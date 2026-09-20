import type { SVGProps } from "react";

export type IconName =
  | "sun"
  | "moon"
  | "check"
  | "plus"
  | "trash"
  | "close"
  | "chevron-right"
  | "chevron-left"
  | "chevron-down"
  | "download"
  | "sparkle"
  | "image"
  | "file"
  | "grid"
  | "list"
  | "sliders"
  | "layers"
  | "menu"
  | "external"
  | "pencil"
  | "expand"
  | "shield";

const PATHS: Record<IconName, string> = {
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.42-1.42M4.92 19.08l1.42-1.42m0-11.32L4.92 4.92m14.16 14.16-1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  check: "m4.5 12.5 5 5 10-11",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  close: "M6 6l12 12M18 6 6 18",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-left": "m15 6-6 6 6 6",
  "chevron-down": "m6 9 6 6 6-6",
  download: "M12 3v12m0 0 4-4m-4 4-4-4M4 19h16",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Zm6.5 9.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z",
  image: "M4 5h16v14H4zM4 15l4.5-4.5L13 15l3-3 4 4M9 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5",
  menu: "M4 7h16M4 12h16M4 17h16",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  pencil: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14 6l3 3",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  shield: "M12 3l7 3v5c0 4.4-2.9 8.1-7 10-4.1-1.9-7-5.6-7-10V6l7-3Z",
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
