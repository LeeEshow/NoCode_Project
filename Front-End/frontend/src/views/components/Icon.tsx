interface IconProps {
  name: string;
  size?: number;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export default function Icon({ name, size = 18, style, 'aria-hidden': ariaHidden }: IconProps) {
  return (
    <span
      className="material-symbols-rounded"
      style={{ fontSize: size, lineHeight: 1, userSelect: 'none', ...style }}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}
