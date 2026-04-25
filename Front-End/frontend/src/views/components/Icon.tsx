interface IconProps {
  name: string;
  size?: number;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 18, style }: IconProps) {
  return (
    <span
      className="material-symbols-rounded"
      style={{ fontSize: size, lineHeight: 1, userSelect: 'none', ...style }}
    >
      {name}
    </span>
  );
}
