type CatLogoProps = {
  size?: number;
  className?: string;
};

export function CatLogo({ size = 48, className }: CatLogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="小黑猫"
    >
      <path
        fill="#111827"
        d="M13 25 10 8l14 9a22 22 0 0 1 16 0l14-9-3 17c3 4 5 9 5 14 0 12-10 21-23 21S10 51 10 39c0-5 1-10 3-14Z"
      />
      <path
        fill="#fff"
        d="M22 33c0 4-2 7-5 7s-5-3-5-7 2-7 5-7 5 3 5 7Zm30 0c0 4-2 7-5 7s-5-3-5-7 2-7 5-7 5 3 5 7Z"
      />
      <circle cx="18" cy="33" r="2.5" fill="#111827" />
      <circle cx="46" cy="33" r="2.5" fill="#111827" />
      <circle cx="19" cy="31" r="1" fill="#fff" />
      <circle cx="47" cy="31" r="1" fill="#fff" />
      <path fill="#f28b9a" d="M29 40c0-2 6-2 6 0-1 3-5 3-6 0Z" />
      <path
        fill="none"
        stroke="#111827"
        strokeLinecap="round"
        strokeWidth="1.5"
        d="M29 43c2 3 4 3 6 0M25 41 13 39m12 5-11 2m25-5 12-2m-12 6 11 2"
      />
    </svg>
  );
}
