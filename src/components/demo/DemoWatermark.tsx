export function DemoWatermark() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      <span
        className="select-none whitespace-nowrap font-black tracking-[0.25em] text-foreground opacity-[0.08]"
        style={{
          fontSize: "min(8vw, 110px)",
          transform: "rotate(-28deg)",
        }}
      >
        DEMO DATA
      </span>
    </div>
  );
}
