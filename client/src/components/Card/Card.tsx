import React from "react";
import "./Card.css";

export type CardProps = {
  imageUrl: string;      // 卡面图片
  back: boolean;         //是否卡背
  atk: number;           // 攻击
  def: number;           // 防御
  width?: number;        // 显示宽度（px），可选，默认 125
  title?: string;        // 可选：卡名/alt 文本
  onClick?: () => void;  // 可选：点击
};

export default function Card({
  imageUrl,
  back = false,
  atk,
  def,
  width = 125,
  title,
  onClick,
}: CardProps) {
  // 用容器的 font-size 作为相对尺寸单位，子元素用 em 实现等比缩放
  const fontSize = width / 8.8; // 经验值：可按需要微调
  return (
    <div
      className="card"
      style={{ width, fontSize }}
      role="img"
      aria-label={title || "card"}
      onClick={onClick}
    >
      <img className="card__image" src={imageUrl} alt={title || "card"} />
      {!back && (
      <div className="stats">
        <div className="stat stat--atk">
          <span className="stat__value">{atk}</span>
        </div>
        <div className="stat stat--def">
          <span className="stat__value">{def}</span>
        </div>
      </div>
	  )}
    </div>
  );
}