const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

interface WaterFillLoaderProps {
  message?: string;
  fullScreen?: boolean;
}

export function WaterFillLoader({ message = "Loading…", fullScreen = true }: WaterFillLoaderProps) {
  const containerClass = fullScreen
    ? "min-h-screen flex flex-col items-center justify-center bg-primary gap-6"
    : "flex flex-col items-center justify-center py-24 gap-6";

  return (
    <div className={containerClass}>
      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* Base logo (faded) */}
        <img
          src={ABG_LOGO_URL}
          className="absolute inset-0 w-full h-full object-contain opacity-20"
          alt=""
        />
        {/* Filled logo with water animation */}
        <div className="absolute inset-0 water-fill-clip">
          <img
            src={ABG_LOGO_URL}
            className="w-full h-full object-contain"
            alt="Loading"
          />
          {/* Blue tint overlay */}
          <div
            className="absolute inset-0 bg-blue-400 opacity-30"
            style={{ mixBlendMode: "color" }}
          />
        </div>
      </div>
      <p className="text-sm font-medium text-primary-foreground animate-pulse">{message}</p>

      <style>{`
        @keyframes waterFill {
          0%   { clip-path: inset(100% 0 0 0); }
          80%  { clip-path: inset(0% 0 0 0); }
          100% { clip-path: inset(0% 0 0 0); }
        }
        .water-fill-clip {
          animation: waterFill 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
