import { NodeData, AnchorPosition, Anchor } from '../types';

/**
 * 节点基类（抽象类）
 * 所有节点类型的基类，定义了节点的通用属性和方法
 */
export abstract class BaseNode {
  public id: string;           // 唯一标识符
  public type: string;         // 节点类型（开始/过程/判定）
  public x: number;            // 中心点 X 坐标
  public y: number;            // 中心点 Y 坐标
  public width: number;        // 宽度
  public height: number;       // 高度
  public text: string;         // 显示文本
  public color: string;        // 填充颜色
  public isSelected: boolean = false;  // 是否被选中
  public isHovered: boolean = false;   // 鼠标是否悬停

  constructor(data: NodeData) {
    this.id = data.id;
    this.type = data.type;
    this.x = data.x;
    this.y = data.y;
    this.width = data.width;
    this.height = data.height;
    this.text = data.text;
    this.color = data.color;
  }

  /**
   * 渲染节点（由子类实现具体形状）
   */
  abstract render(ctx: CanvasRenderingContext2D): void;

  /**
   * 点击检测（判断点是否在节点内）
   */
  public hitTest(x: number, y: number): boolean {
    return (
      x >= this.x - this.width / 2 &&
      x <= this.x + this.width / 2 &&
      y >= this.y - this.height / 2 &&
      y <= this.y + this.height / 2
    );
  }

  /**
   * 获取节点的四个连接锚点
   */
  public getAnchors(): Anchor[] {
    return [
      { id: `${this.id}-top`, nodeId: this.id, position: '上', x: this.x, y: this.y - this.height / 2 },
      { id: `${this.id}-bottom`, nodeId: this.id, position: '下', x: this.x, y: this.y + this.height / 2 },
      { id: `${this.id}-left`, nodeId: this.id, position: '左', x: this.x - this.width / 2, y: this.y },
      { id: `${this.id}-right`, nodeId: this.id, position: '右', x: this.x + this.width / 2, y: this.y },
    ];
  }

  /**
   * 获取指定位置的锚点
   */
  public getAnchor(pos: AnchorPosition): Anchor {
    const anchors = this.getAnchors();
    return anchors.find(a => a.position === pos)!;
  }

  /**
   * 绘制节点文本（居中显示）
   */
  protected drawText(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.x, this.y);
  }

  /**
   * 绘制选中/悬停效果以及连接锚点
   */
  protected drawSelection(ctx: CanvasRenderingContext2D) {
    if (this.isSelected || this.isHovered) {
      // 1. 选中时绘制虚线边框
      if (this.isSelected) {
        ctx.strokeStyle = '#3b82f6';      // 蓝色
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);          // 5px 虚线
        ctx.strokeRect(
          this.x - this.width / 2 - 4,
          this.y - this.height / 2 - 4,
          this.width + 8,
          this.height + 8
        );
        ctx.setLineDash([]);              // 恢复实线
      }

      // 2. 绘制连接锚点（选中或悬停时显示）
      const anchors = this.getAnchors();
      anchors.forEach(anchor => {
        // 外圈光晕（扩大点击区域）
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.fill();

        // 内点（可点击区域）
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';        // 蓝色
        ctx.fill();
        ctx.strokeStyle = '#fff';          // 白色描边
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
  }
}

/**
 * 开始节点（圆角矩形）
 * 用于标识流程图的起点
 */
export class StartNode extends BaseNode {
  render(ctx: CanvasRenderingContext2D): void {
    const radius = 20;  // 圆角半径
    ctx.beginPath();
    ctx.roundRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height, radius);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    this.drawText(ctx);
    this.drawSelection(ctx);
  }
}

/**
 * 过程节点（矩形）
 * 用于表示流程中的操作或步骤
 */
export class ProcessNode extends BaseNode {
  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    
    this.drawText(ctx);
    this.drawSelection(ctx);
  }
}

/**
 * 判定节点（菱形/钻石形）
 * 用于表示条件判断或分支决策
 */
export class DecisionNode extends BaseNode {
  render(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.height / 2);           // 上顶点
    ctx.lineTo(this.x + this.width / 2, this.y);            // 右顶点
    ctx.lineTo(this.x, this.y + this.height / 2);           // 下顶点
    ctx.lineTo(this.x - this.width / 2, this.y);            // 左顶点
    ctx.closePath();
    
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    this.drawText(ctx);
    this.drawSelection(ctx);
  }
  
  /**
   * 菱形节点的点击检测（重写基类方法）
   */
  public hitTest(x: number, y: number): boolean {
    // 计算归一化坐标（相对于中心，范围 [-1, 1]）
    const dx = Math.abs(x - this.x) / (this.width / 2);
    const dy = Math.abs(y - this.y) / (this.height / 2);
    // 曼哈顿距离 ≤ 1 表示在菱形内
    return dx + dy <= 1;
  }
}