const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

interface WaterFillLoaderProps {
  message?: string;
  fullScreen?: boolean;
}

export function WaterFillLoader({
  message = "Loading",
  fullScreen = true,
}: WaterFillLoaderProps) {

  /* ── dimensions scale with mode ── */
  const logoW = fullScreen ? 260 : 200;
  const logoH = fullScreen ? 68  : 52;

  return (
    <div
      className={
        fullScreen
          ? "min-h-screen flex flex-col items-center justify-center gap-8 relative overflow-hidden"
          : "flex flex-col items-center justify-center py-20 gap-6"
      }
      style={fullScreen ? {
        background:
          "linear-gradient(160deg, hsl(214 100% 10%) 0%, hsl(217 91% 16%) 50%, hsl(210 100% 10%) 100%)",
      } : undefined}
    >

      {/* ── Ambient glow (fullscreen only) ── */}
      {fullScreen && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 700,
              height: 300,
              background: "radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 400,
              height: 160,
              background: "radial-gradient(ellipse, rgba(147,197,253,0.08) 0%, transparent 70%)",
              filter: "blur(30px)",
            }}
          />
        </div>
      )}

      {/* ── Logo + rings ── */}
      <div className="relative flex items-center justify-center">

        {/* Ripple rings (fullscreen only) */}
        {fullScreen && (
          <div
            className="absolute flex items-center justify-center pointer-events-none"
            style={{ width: logoW + 160, height: logoH + 120 }}
          >
            <div className="absolute inset-0 rounded-full border border-white/[0.04] loader-ring-1" />
            <div
              className="absolute rounded-full border border-white/[0.04] loader-ring-2"
              style={{ inset: "20px 30px" }}
            />
            <div
              className="absolute rounded-full border border-white/[0.03] loader-ring-3"
              style={{ inset: "40px 60px" }}
            />
          </div>
        )}

        {/* Logo frame */}
        <div
          className="relative overflow-hidden"
          style={{ width: logoW, height: logoH }}
        >
          {/* Ghost / faded base */}
          <img
            src={ABG_LOGO_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ opacity: 0.1 }}
          />

          {/* Rising fill layer */}
          <div className="absolute inset-0 loader-water-fill">
            <img
              src={ABG_LOGO_URL}
              alt="Loading"
              className="w-full h-full object-contain"
            />
            {/* Cool water-blue luminance tint */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(96,165,250,0.18) 0%, rgba(186,230,253,0.10) 100%)",
              }}
            />
          </div>

          {/* Wave glow line — tracks the fill boundary */}
          <div
            className="absolute left-[-20%] right-[-20%] loader-wave-line"
            style={{ height: 3 }}
          />
        </div>
      </div>

      {/* ── Loading text + dots ── */}
      <div
        className="flex items-center gap-2 font-semibold"
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: fullScreen ? "rgba(255,255,255,0.45)" : "hsl(var(--muted-foreground))",
        }}
      >
        <span>{message.replace(/[.…]+$/, "")}</span>
        <span className="flex items-center gap-[3px]">
          <span className="block rounded-full bg-current loader-dot-1" style={{ width: 3, height: 3 }} />
          <span className="block rounded-full bg-current loader-dot-2" style={{ width: 3, height: 3 }} />
          <span className="block rounded-full bg-current loader-dot-3" style={{ width: 3, height: 3 }} />
        </span>
      </div>

      {/* ── Keyframes ── */}
      <style>{`

        /* Water rises bottom → top, fades out, resets */
        @keyframes loaderWaterRise {
          0%   { clip-path: inset(100% 0 0 0); opacity: 0; }
          8%   { clip-path: inset(100% 0 0 0); opacity: 1; }
          72%  { clip-path: inset(0%   0 0 0); opacity: 1; }
          86%  { clip-path: inset(0%   0 0 0); opacity: 1; }
          100% { clip-path: inset(0%   0 0 0); opacity: 0; }
        }
        .loader-water-fill {
          animation: loaderWaterRise 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        /* Wave line tracks the fill boundary in sync */
        @keyframes loaderWaveLine {
          0%    { bottom: 0%;    opacity: 0; }
          7%    { bottom: 0%;    opacity: 0; }
          8%    { bottom: 0%;    opacity: 1; }
          72%   { bottom: 100%; opacity: 1; }
          86%   { bottom: 100%; opacity: 0.6; }
          100%  { bottom: 100%; opacity: 0; }
        }
        @keyframes loaderWaveSway {
          0%,100% { transform: scaleX(1)   translateY(0px);  }
          50%     { transform: scaleX(1.02) translateY(-1px); }
        }
        .loader-wave-line {
          position: absolute;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(147,197,253,0.5) 20%,
            rgba(255,255,255,0.95) 50%,
            rgba(147,197,253,0.5) 80%,
            transparent 100%
          );
          box-shadow:
            0 0 6px  rgba(147,197,253,0.8),
            0 0 16px rgba(147,197,253,0.4),
            0 0 32px rgba(147,197,253,0.15);
          border-radius: 2px;
          animation:
            loaderWaveLine 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite,
            loaderWaveSway 0.9s ease-in-out infinite;
        }

        /* Ripple rings */
        @keyframes loaderRing {
          0%   { transform: scale(0.88); opacity: 0;    }
          15%  { opacity: 1;                            }
          100% { transform: scale(1.14); opacity: 0;   }
        }
        .loader-ring-1 { animation: loaderRing 3.2s ease-out 0s   infinite; }
        .loader-ring-2 { animation: loaderRing 3.2s ease-out 1.0s infinite; }
        .loader-ring-3 { animation: loaderRing 3.2s ease-out 2.0s infinite; }

        /* Dots */
        @keyframes loaderDot {
          0%, 70%, 100% { opacity: 0.25; transform: translateY(0);    }
          35%            { opacity: 1;   transform: translateY(-2px);  }
        }
        .loader-dot-1 { animation: loaderDot 1.5s ease-in-out 0s    infinite; }
        .loader-dot-2 { animation: loaderDot 1.5s ease-in-out 0.18s infinite; }
        .loader-dot-3 { animation: loaderDot 1.5s ease-in-out 0.36s infinite; }

      `}</style>
    </div>
  );
}
