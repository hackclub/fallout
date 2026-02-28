import { useRef, useState, useEffect } from "react";

const Frame = ({
  width,
  height,
  className = "",
  children,
}: {
  width?: number;
  height?: number;
  className?: string;
  children?: React.ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState(110);

  useEffect(() => {
    if (!containerRef.current) return;
    const { offsetWidth, offsetHeight } = containerRef.current;
    const size = Math.min(offsetWidth, offsetHeight);
    setCorner(size < 150 ? 60 : 110);
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const size = Math.min(width, height);
      setCorner(size < 150 ? 60 : 110);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const borderStyle = (pos: string) => {
    const styles: Record<string, React.CSSProperties> = {
      topLeft: { top: 0, left: 0, width: corner, height: corner },
      topRight: { top: 0, right: 0, width: corner, height: corner },
      bottomLeft: { bottom: 0, left: 0, width: corner, height: corner },
      bottomRight: { bottom: 0, right: 0, width: corner, height: corner },
      top: {
        top: 0,
        left: corner,
        width: `calc(100% - ${corner * 2}px)`,
        height: corner,
      },
      bottom: {
        bottom: 0,
        left: corner,
        width: `calc(100% - ${corner * 2}px)`,
        height: corner,
      },
      left: {
        top: corner,
        left: 0,
        width: corner,
        height: `calc(100% - ${corner * 2}px)`,
      },
      right: {
        top: corner,
        right: 0,
        width: corner,
        height: `calc(100% - ${corner * 2}px)`,
      },
    };
    return {
      position: "absolute" as const,
      pointerEvents: "none" as const,
      ...styles[pos],
    };
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
        minWidth: 100,
        minHeight: 100,
      }}
    >
      <div className="w-full h-full absolute pt-3 pb-5 pl-7 pr-10">
        <div className="bg-light-brown w-full h-full p-4 z-12 flex justify-center">
          {children}
        </div>
      </div>
      <img src="/border/top_left.png" alt="" style={borderStyle("topLeft")} />
      <img src="/border/top.png" alt="" style={borderStyle("top")} />
      <img src="/border/top_right.png" alt="" style={borderStyle("topRight")} />
      <img src="/border/left.png" alt="" style={borderStyle("left")} />
      <img src="/border/right.png" alt="" style={borderStyle("right")} />
      <img
        src="/border/bottom_left.png"
        alt=""
        style={borderStyle("bottomLeft")}
      />
      <img src="/border/bottom.png" alt="" style={borderStyle("bottom")} />
      <img
        src="/border/bottom_right.png"
        alt=""
        style={borderStyle("bottomRight")}
      />
    </div>
  );
};

export default Frame;
