import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import "./CardArc.css";

type CardArcProps = {
  children: React.ReactNode;
  height?: number;       // 内部布局参考高度（容器本体高度）
  amplitude?: number;    // 中心抬升高度
  maxRotate?: number;    // 两端最大旋转角度
  offsetY?: number;      // 整体向下平移像素（默认 200）
  clipBelowCenterQuarter?: boolean; // 是否按中间卡牌下方 1/4 基准线裁剪（默认开启）
  mirror? : boolean;
};

export default function CardArc({
  children,
  height = 200,
  amplitude = 80,
  maxRotate = 12,
  offsetY = 0,
  clipBelowCenterQuarter = false,
  mirror = false,
}: CardArcProps) {
  const items = React.Children.toArray(children);
  const n = items.length;
  const center = (n - 1) / 2;
  const denom = center || 1;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const middleRef = useRef<HTMLDivElement | null>(null);

  const [clipHeight, setClipHeight] = useState<number>(height);

  const childrenWithPositions = useMemo(() => {
    return items.map((child, i) => {
      const t = (i - center) / denom;         // [-1, 1]
      const y = amplitude * (1 + t * t * (mirror ? 1 : -1));      // 中间最大抬升

      const angle = t * maxRotate * (mirror ? -1 : 1);
      const leftPercent = n === 1 ? 50 : (i / (n - 1)) * (mirror ? 65 : 60) + (mirror ? 18 : 20);
      const z = 1000 + n;

      const refProp = i === Math.round(center) ? { ref: middleRef } : {};

      return (
        <div
          key={i}
          className="card-arc__item"
          style={{
            left: `${leftPercent}%`,
            transform: `translateX(-50%) translateY(${-y}px) rotate(${angle}deg)`,
            zIndex: Math.round(z),
          }}
          {...refProp}
        >
          {child}
        </div>
      );
    });
  }, [items, center, denom, amplitude, maxRotate, n, mirror]);

  return (
    <div
      className="card-arc-viewport"
      ref={viewportRef}
    >
      <div
        className="card-arc"
        ref={containerRef}
        style={{
          height,
          transform: `translateY(${offsetY}px)`, // 整体下移
        }}
      >
        {childrenWithPositions}
      </div>
    </div>
  );
}
