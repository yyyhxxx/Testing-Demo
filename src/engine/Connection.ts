import { ConnectionData, Anchor } from '../types';
import { BaseNode } from './Nodes';

/**
 * 连接线类
 * 负责管理两个节点之间的连接，包括路径计算、渲染、交互检测
 */
export class Connection {
  public id: string;
  public sourceNodeId: string;      // 源节点 ID
  public sourceAnchor: string;      // 源锚点方向（上/下/左/右）
  public targetNodeId: string;      // 目标节点 ID
  public targetAnchor: string;      // 目标锚点方向（上/下/左/右）
  public midRatio: number;          // 中间控制点位置（0-1），仅对 3 段线有效
  public isSelected: boolean = false;  // 是否被选中
  public isHovered: boolean = false;   // 鼠标是否悬停

  constructor(data: ConnectionData) {
    this.id = data.id;
    this.sourceNodeId = data.sourceNodeId;
    this.sourceAnchor = data.sourceAnchor;
    this.targetNodeId = data.targetNodeId;
    this.targetAnchor = data.targetAnchor;
    this.midRatio = data.midRatio ?? 0.5;  // 默认中点位置 0.5
  }

  /**
   * 计算连接线的所有转折点坐标
   */
  public getPoints(nodes: BaseNode[]): { x: number, y: number }[] {
    const sourceNode = nodes.find(n => n.id === this.sourceNodeId);
    const targetNode = nodes.find(n => n.id === this.targetNodeId);

    if (!sourceNode || !targetNode) return [];

    const start = sourceNode.getAnchor(this.sourceAnchor as any);
    const end = targetNode.getAnchor(this.targetAnchor as any);

    const points: { x: number, y: number }[] = [start];

    // 判断源锚点和目标锚点是否为水平方向（左/右）
    const isSourceHorizontal = this.sourceAnchor === '左' || this.sourceAnchor === '右';
    const isTargetHorizontal = this.targetAnchor === '左' || this.targetAnchor === '右';

    const buffer = 20;  // 最小缓冲区距离，防止线条与节点重叠

    // 情况1：两端都是水平方向 → 3段线 H→V→H
    if (isSourceHorizontal && isTargetHorizontal) {
      let midX = start.x + (end.x - start.x) * this.midRatio;
      
      // 防止中间点过于靠近节点
      if (this.sourceAnchor === '右' && this.targetAnchor === '左') {
        // 源节点右侧 → 目标节点左侧：中间点在两者之间
        midX = Math.max(start.x + buffer, Math.min(end.x - buffer, midX));
      } else if (this.sourceAnchor === '左' && this.targetAnchor === '右') {
        // 源节点左侧 → 目标节点右侧：中间点可能在外侧，需要额外约束
        midX = Math.max(end.x + buffer, Math.min(start.x - buffer, midX));
      }

      points.push({ x: midX, y: start.y });  // 第一段终点
      points.push({ x: midX, y: end.y });    // 第二段终点
    } 
    // 情况2：两端都是垂直方向 → 3段线 V→H→V
    else if (!isSourceHorizontal && !isTargetHorizontal) {
      let midY = start.y + (end.y - start.y) * this.midRatio;

      if (this.sourceAnchor === '下' && this.targetAnchor === '上') {
        midY = Math.max(start.y + buffer, Math.min(end.y - buffer, midY));
      } else if (this.sourceAnchor === '上' && this.targetAnchor === '下') {
        midY = Math.max(end.y + buffer, Math.min(start.y - buffer, midY));
      }

      points.push({ x: start.x, y: midY });  // 第一段终点
      points.push({ x: end.x, y: midY });    // 第二段终点
    } 
    // 情况3：源水平 → 目标垂直 → 2段线 H→V
    else if (isSourceHorizontal && !isTargetHorizontal) {
      points.push({ x: end.x, y: start.y });  // 拐点：(目标X, 源Y)
    } 
    // 情况4：源垂直 → 目标水平 → 2段线 V→H
    else {
      points.push({ x: start.x, y: end.y });  // 拐点：(源X, 目标Y)
    }

    points.push(end);  // 添加终点
    return points;
  }

  /**
   * 渲染连接线
   */
  render(ctx: CanvasRenderingContext2D, nodes: BaseNode[]): void {
    const points = this.getPoints(nodes);
    if (points.length < 2) return;

    // 绘制折线
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    
    // 根据状态设置样式
    // 选中：蓝色粗线 | 悬停：灰色 | 普通：深灰色
    ctx.strokeStyle = this.isSelected ? '#3b82f6' : (this.isHovered ? '#94a3b8' : '#64748b');
    ctx.lineWidth = this.isSelected ? 3 : 2;
    ctx.stroke();

    // 在终点绘制箭头
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    this.drawArrow(ctx, last.x, last.y, prev.x, prev.y);
  }

  /**
   * 检测点是否命中连接线
   */
  public hitTest(x: number, y: number, nodes: BaseNode[]): boolean {
    const points = this.getPoints(nodes);
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      const dist = this.distToSegment({ x, y }, p1, p2);
      if (dist < 8) return true;  // 8px 命中半径
    }
    return false;
  }

  /**
   * 检测是否命中可拖拽的中间线段（仅 3 段线）
   */
  public getDraggableSegment(x: number, y: number, nodes: BaseNode[]): number | null {
    const points = this.getPoints(nodes);
    // 只有 3 段线（4 个点）才有可拖拽的中间线段
    if (points.length !== 4) return null;

    const p1 = points[1];  // 中间段起点
    const p2 = points[2];  // 中间段终点
    const dist = this.distToSegment({ x, y }, p1, p2);
    if (dist < 10) return 1;  // 10px 命中半径
    
    return null;
  }

  /**
   * 计算点到线段的最短距离
   */
  private distToSegment(p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;  // 线段长度的平方
    if (l2 === 0) return Math.sqrt((p.x - v.x)**2 + (p.y - v.y)**2);  // 线段退化为点
    
    // 计算投影参数 t（0-1 之间，表示最近点在线段上的位置）
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));  // 钳制到线段范围内
    
    // 计算投影点坐标
    const projX = v.x + t * (w.x - v.x);
    const projY = v.y + t * (w.y - v.y);
    
    // 返回目标点到投影点的距离
    return Math.sqrt((p.x - projX)**2 + (p.y - projY)**2);
  }

  /**
   * 绘制箭头（在连线末端）
   */
  private drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, fromX: number, fromY: number) {
    const headlen = 10;  // 箭头长度
    const angle = Math.atan2(y - fromY, x - fromX);  // 连线方向角
    
    ctx.beginPath();
    // 绘制左翼
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - headlen * Math.cos(angle - Math.PI / 6),
      y - headlen * Math.sin(angle - Math.PI / 6)
    );
    // 绘制右翼
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - headlen * Math.cos(angle + Math.PI / 6),
      y - headlen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }
}