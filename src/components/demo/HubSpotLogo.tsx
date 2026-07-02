export function HubSpotLogo({ size = 28 }: { size?: number }) {
  // Stylized HubSpot sprocket mark
  const color = "#FF7A59";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="HubSpot"
    >
      <g stroke={color} strokeWidth="2.8" fill="none" strokeLinecap="round">
        {/* spokes */}
        <line x1="20" y1="11.5" x2="20" y2="3" />
        <line x1="20" y1="28.5" x2="20" y2="37" />
        <line x1="11.5" y1="20" x2="3" y2="20" />
        <line x1="28.5" y1="20" x2="37" y2="20" />
      </g>
      <g fill={color}>
        {/* corner nodes */}
        <circle cx="3" cy="3" r="2.6" />
        <circle cx="37" cy="3" r="2.6" />
        <circle cx="3" cy="37" r="2.6" />
        <circle cx="37" cy="37" r="2.6" />
      </g>
      <circle cx="20" cy="20" r="8.2" fill="none" stroke={color} strokeWidth="2.8" />
      <circle cx="26.5" cy="13.5" r="2.6" fill={color} />
    </svg>
  );
}
