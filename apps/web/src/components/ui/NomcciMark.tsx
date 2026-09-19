import type { SVGProps } from "react";

interface NomcciMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function NomcciMark({ size = 22, ...rest }: NomcciMarkProps) {
  return (
    <svg
      viewBox="250 180 760 850"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <polygon points="293,228 293,368 961,983 962,781 837,663 831,712" />
      <polygon points="293,419 293,987 421,872 421,534" />
      <polygon points="961,242 837,364 837,619 961,739" />
      <polygon points="455,565 461,652 819,985 907,986" />
    </svg>
  );
}
