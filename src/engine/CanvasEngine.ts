import { BaseNode, StartNode, ProcessNode, DecisionNode } from './Nodes';
import { Connection } from './Connection';
import { FlowData, NodeData, ConnectionData, NodeType, Anchor } from '../types';

/**
 * Canvas 流程图引擎
 * 负责管理所有节点、连接线，处理用户交互事件，并实时渲染
 */
export class CanvasEngine {
  // DOM 元素与渲染上下文
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  // 数据存储
  private nodes: BaseNode[] = [];           // 所有节点
  private connections: Connection[] = [];   // 所有连接线
  
  // 选中状态
  private selectedNode: BaseNode | null = null;
  private selectedConnection: Connection | null = null;
  
  // 拖拽状态
  private isDragging: boolean = false;           // 是否正在拖拽
  private draggingNode: BaseNode | null = null;  // 正在拖拽的节点
  private draggingConnection: Connection | null = null;  // 正在拖拽的连接线
  private draggingSegmentIndex: number | null = null;    // 拖拽的线段索引
  private hasMoved: boolean = false;             // 鼠标是否移动过（区分点击与拖拽）
  private mouseDownPos = { x: 0, y: 0 };         // 鼠标按下位置
  private dragOffset = { x: 0, y: 0 };           // 拖拽偏移量（节点中心与鼠标的差值）
  
  // 临时连线（从锚点拖拽创建新连接时）
  private tempLine: { start: Anchor; end: { x: number; y: number } } | null = null;
  
  // 悬停状态（用于视觉反馈）
  private hoveredNode: BaseNode | null = null;
  private hoveredAnchor: Anchor | null = null;
  
  // 状态变化回调（通知 React 组件更新 UI）
  private onStateChange: () => void;

  constructor(canvas: HTMLCanvasElement, onStateChange: () => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onStateChange = onStateChange;
    
    this.initEvents();
    this.render();
  }

  /**
   * 初始化事件监听
   */
  private initEvents() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    window.addEventListener('mousemove', this.handleMouseMove.bind(this));
    window.addEventListener('mouseup', this.handleMouseUp.bind(this));
    
    // 拖拽创建节点
    this.canvas.addEventListener('dragover', (e) => e.preventDefault());
    this.canvas.addEventListener('drop', this.handleDrop.bind(this));
  }

  /**
   * 获取鼠标在 canvas 上的坐标
   */
  private getMousePos(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /**
   * 鼠标按下事件处理
   * 优先级：锚点 > 节点 > 连接线中点 > 连接线 > 空白区域
   */
  private handleMouseDown(e: MouseEvent) {
    const pos = this.getMousePos(e);
    
    // 1. 检查是否点击了锚点（用于创建新连线）
    let hitAnchor: Anchor | null = null;
    let hitAnchorNode: BaseNode | null = null;

    for (const node of this.nodes) {
      const anchors = node.getAnchors();
      const found = anchors.find(a => {
        const dist = Math.sqrt((a.x - pos.x) ** 2 + (a.y - pos.y) ** 2);
        return dist < 12; // 锚点命中半径 12px
      });
      if (found) {
        hitAnchor = found;
        hitAnchorNode = node;
        break;
      }
    }
      
    // 命中锚点：开始创建临时连线
    if (hitAnchor && hitAnchorNode) {
      this.selectNode(hitAnchorNode);
      this.tempLine = { start: hitAnchor, end: pos };
      this.onStateChange();
      return;
    }

    // 2. 检查是否点击了节点（倒序查找，优先选中上层节点）
    const hitNode = [...this.nodes].reverse().find(n => n.hitTest(pos.x, pos.y));
    
    this.mouseDownPos = pos;
    this.hasMoved = false;

    if (hitNode) {
      // 命中节点：准备拖拽
      this.isDragging = true;
      this.draggingNode = hitNode;
      this.dragOffset = {
        x: pos.x - hitNode.x,
        y: pos.y - hitNode.y
      };
    } else {
      // 3. 检查是否点击了可拖拽的线段（连接线的中间段）
      let hitConnSegment: Connection | null = null;
      let segmentIndex: number | null = null;
      
      for (const conn of this.connections) {
        segmentIndex = conn.getDraggableSegment(pos.x, pos.y, this.nodes);
        if (segmentIndex !== null) {
          hitConnSegment = conn;
          break;
        }
      }

      if (hitConnSegment && segmentIndex !== null) {
        // 命中可拖拽线段：准备调整连接线路径
        this.isDragging = true;
        this.draggingConnection = hitConnSegment;
        this.draggingSegmentIndex = segmentIndex;
        this.selectConnection(hitConnSegment);
      } else {
        // 4. 检查是否点击了连接线（非线段部分，用于选中）
        const hitConnection = this.connections.find(c => c.hitTest(pos.x, pos.y, this.nodes));
        if (hitConnection) {
          this.selectConnection(hitConnection);
          this.selectNode(null);
        } else {
          // 5. 空白区域：取消所有选中
          this.selectNode(null);
          this.selectConnection(null);
        }
      }
      this.onStateChange();
    }
  }

  /**
   * 鼠标移动事件处理
   * 更新悬停状态、光标样式、拖拽位置
   */
  private handleMouseMove(e: MouseEvent) {
    const pos = this.getMousePos(e);
    
    // 重置所有悬停状态
    this.nodes.forEach(n => n.isHovered = false);
    this.connections.forEach(c => c.isHovered = false);
    this.hoveredAnchor = null;
    this.hoveredNode = null;

    // 1. 检查锚点悬停
    for (const node of this.nodes) {
      const anchors = node.getAnchors();
      const found = anchors.find(a => {
        const dist = Math.sqrt((a.x - pos.x) ** 2 + (a.y - pos.y) ** 2);
        return dist < 12;
      });
      if (found) {
        this.hoveredAnchor = found;
        this.hoveredNode = node;
        node.isHovered = true;
        break;
      }
    }

    // 2. 检查节点悬停（无锚点悬停时）
    if (!this.hoveredAnchor) {
      const hitNode = [...this.nodes].reverse().find(n => n.hitTest(pos.x, pos.y));
      if (hitNode) {
        this.hoveredNode = hitNode;
        hitNode.isHovered = true;
      } else {
        // 3. 检查连接线悬停
        const hitConnection = this.connections.find(c => c.hitTest(pos.x, pos.y, this.nodes));
        if (hitConnection) {
          hitConnection.isHovered = true;
        }
      }
    }

    // 4. 更新光标样式
    if (this.hoveredAnchor) {
      this.canvas.style.cursor = 'crosshair';      // 锚点：十字光标
    } else if (this.hoveredNode) {
      this.canvas.style.cursor = this.isDragging ? 'grabbing' : 'grab';  // 节点：抓手
    } else {
      // 检查是否悬停在可拖拽线段上
      let overSegment = false;
      for (const conn of this.connections) {
        if (conn.getDraggableSegment(pos.x, pos.y, this.nodes) !== null) {
          overSegment = true;
          const isHorizontal = conn.sourceAnchor === '左' || conn.sourceAnchor === '右';
          this.canvas.style.cursor = isHorizontal ? 'ew-resize' : 'ns-resize';  // 水平/垂直调整
          break;
        }
      }
      if (!overSegment) {
        this.canvas.style.cursor = 'default';
      }
    }

    // 5. 处理拖拽逻辑
    if (this.isDragging) {
      // 检测鼠标是否移动超过阈值（区分点击和拖拽）
      const dist = Math.sqrt((pos.x - this.mouseDownPos.x) ** 2 + (pos.y - this.mouseDownPos.y) ** 2);
      if (dist > 3) {
        this.hasMoved = true;
      }

      // 拖拽节点：更新位置
      if (this.draggingNode) {
        this.draggingNode.x = pos.x - this.dragOffset.x;
        this.draggingNode.y = pos.y - this.dragOffset.y;
        this.onStateChange();
      } 
      // 拖拽连接线中点：调整 midRatio
      else if (this.draggingConnection) {
        const sourceNode = this.nodes.find(n => n.id === this.draggingConnection!.sourceNodeId);
        const targetNode = this.nodes.find(n => n.id === this.draggingConnection!.targetNodeId);
        if (sourceNode && targetNode) {
          const start = sourceNode.getAnchor(this.draggingConnection!.sourceAnchor as any);
          const end = targetNode.getAnchor(this.draggingConnection!.targetAnchor as any);
          
          const isHorizontal = this.draggingConnection!.sourceAnchor === '左' || this.draggingConnection!.sourceAnchor === '右';
          
          // 根据源锚点方向计算新的 midRatio
          // 水平方向起点：中间段是垂直的，拖拽改变水平位置
          // 垂直方向起点：中间段是水平的，拖拽改变垂直位置
          if (isHorizontal) {
            const range = end.x - start.x;
            if (Math.abs(range) > 10) {
              this.draggingConnection!.midRatio = (pos.x - start.x) / range;
            }
          } else {
            const range = end.y - start.y;
            if (Math.abs(range) > 10) {
              this.draggingConnection!.midRatio = (pos.y - start.y) / range;
            }
          }
          // 限制比例范围 0.1 ~ 0.9，避免过近导致线条交叉
          this.draggingConnection!.midRatio = Math.max(0.1, Math.min(0.9, this.draggingConnection!.midRatio));
          this.onStateChange();
        }
      }
    }
    
    // 6. 更新临时连线的终点位置
    if (this.tempLine) {
      this.tempLine.end = pos;
    }
  }

  /**
   * 鼠标抬起事件处理
   * 完成拖拽创建连线、完成节点拖拽选中
   */
  private handleMouseUp(e: MouseEvent) {
    // 完成临时连线：创建新连接
    if (this.tempLine) {
      const pos = this.getMousePos(e);
      
      let targetNode: BaseNode | null = null;
      let targetAnchor: Anchor | null = null;

      // 1. 优先检测是否命中目标锚点
      for (const node of this.nodes) {
        if (node.id === this.tempLine.start.nodeId) continue;  // 不能连接到自己
        
        const anchors = node.getAnchors();
        const found = anchors.find(a => {
          const dist = Math.sqrt((a.x - pos.x) ** 2 + (a.y - pos.y) ** 2);
          return dist < 20; // 目标锚点吸附半径 20px
        });
        
        if (found) {
          targetNode = node;
          targetAnchor = found;
          break;
        }
      }

      // 2. 如果没有命中锚点，检查是否落在节点上，自动吸附到最近的锚点
      if (!targetAnchor) {
        targetNode = this.nodes.find(n => n.id !== this.tempLine!.start.nodeId && n.hitTest(pos.x, pos.y)) || null;
        if (targetNode) {
          const anchors = targetNode.getAnchors();
          let minDist = Infinity;
          anchors.forEach(a => {
            const dist = Math.sqrt((a.x - pos.x) ** 2 + (a.y - pos.y) ** 2);
            if (dist < minDist) {
              minDist = dist;
              targetAnchor = a;
            }
          });
        }
      }
      
      // 3. 创建连接
      if (targetNode && targetAnchor) {
        this.addConnection({
          id: crypto.randomUUID(),
          sourceNodeId: this.tempLine.start.nodeId,
          sourceAnchor: this.tempLine.start.position,
          targetNodeId: targetNode.id,
          targetAnchor: targetAnchor.position
        });
      }
      
      this.tempLine = null;
      this.onStateChange();
    }
    
    // 完成节点拖拽：如果鼠标没有移动，则视为点击选中
    if (this.isDragging) {
      if (this.draggingNode && !this.hasMoved) {
        this.selectNode(this.draggingNode);
      }
      this.onStateChange();
    }

    // 重置所有拖拽状态
    this.isDragging = false;
    this.draggingNode = null;
    this.draggingConnection = null;
    this.draggingSegmentIndex = null;
    this.hasMoved = false;
  }

  /**
   * 拖拽创建节点
   * 从侧边栏拖拽节点类型到画布上
   */
  private handleDrop(e: DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer?.getData('nodeType') as NodeType;
    if (!type) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    this.addNode({
      id: crypto.randomUUID(),
      type,
      x,
      y,
      width: 120,
      height: 60,
      text: type,
      // 根据节点类型设置默认颜色
      color: type === '开始' ? '#bbf7d0' : type === '判定' ? '#fef08a' : '#bfdbfe'
    });
  }

  /**
   * 添加节点
   */
  public addNode(data: NodeData) {
    let node: BaseNode;
    switch (data.type) {
      case '开始': node = new StartNode(data); break;
      case '判定': node = new DecisionNode(data); break;
      default: node = new ProcessNode(data); break;
    }
    this.nodes.push(node);
    this.selectNode(node);
    this.onStateChange();
  }

  /**
   * 添加连接线
   */
  public addConnection(data: ConnectionData) {
    this.connections.push(new Connection(data));
    this.onStateChange();
  }

  /**
   * 选中节点（同时取消其他选中状态）
   */
  public selectNode(node: BaseNode | null) {
    this.nodes.forEach(n => n.isSelected = false);
    if (node) {
      node.isSelected = true;
      this.selectConnection(null);  // 选中节点时取消连线选中
    }
    this.selectedNode = node;
  }

  /**
   * 选中连接线（同时取消其他选中状态）
   */
  public selectConnection(conn: Connection | null) {
    this.connections.forEach(c => c.isSelected = false);
    if (conn) {
      conn.isSelected = true;
      this.selectNode(null);  // 选中连线时取消节点选中
    }
    this.selectedConnection = conn;
  }

  /**
   * 获取当前选中的节点
   */
  public getSelectedNode() {
    return this.selectedNode;
  }

  /**
   * 获取当前选中的连接线
   */
  public getSelectedConnection() {
    return this.selectedConnection;
  }

  /**
   * 获取所有节点
   */
  public getNodes() {
    return this.nodes;
  }

  /**
   * 更新选中节点的属性
   */
  public updateSelectedNode(data: Partial<NodeData>) {
    if (this.selectedNode) {
      Object.assign(this.selectedNode, data);
      this.onStateChange();
    }
  }

  /**
   * 删除选中的节点或连接线
   * 删除节点时，同时删除所有与该节点相连的连接线
   */
  public deleteSelected() {
    if (this.selectedNode) {
      const id = this.selectedNode.id;
      this.nodes = this.nodes.filter(n => n.id !== id);
      this.connections = this.connections.filter(c => c.sourceNodeId !== id && c.targetNodeId !== id);
      this.selectedNode = null;
    } else if (this.selectedConnection) {
      const id = this.selectedConnection.id;
      this.connections = this.connections.filter(c => c.id !== id);
      this.selectedConnection = null;
    }
    this.onStateChange();
  }

  /**
   * 导出流程图数据（用于保存）
   */
  public getData(): FlowData {
    return {
      nodes: this.nodes.map(n => ({
        id: n.id,
        type: n.type as NodeType,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        text: n.text,
        color: n.color
      })),
      edges: this.connections.map(c => ({
        id: c.id,
        sourceNodeId: c.sourceNodeId,
        sourceAnchor: c.sourceAnchor as any,
        targetNodeId: c.targetNodeId,
        targetAnchor: c.targetAnchor as any
      }))
    };
  }

  /**
   * 加载流程图数据（用于打开文件）
   */
  public loadData(data: FlowData) {
    this.nodes = [];
    this.connections = [];
    data.nodes.forEach(n => this.addNode(n));
    data.edges.forEach(e => this.addConnection(e));
    this.selectNode(null);
    this.onStateChange();
  }

  /**
   * 渲染循环
   * 使用 requestAnimationFrame 实现持续渲染
   */
  public render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 1. 绘制背景网格
    this.drawGrid();
    
    // 2. 绘制所有连接线
    this.connections.forEach(c => c.render(this.ctx, this.nodes));
    
    // 3. 绘制临时连线（拖拽创建时）
    if (this.tempLine) {
      // 虚线
      this.ctx.beginPath();
      this.ctx.moveTo(this.tempLine.start.x, this.tempLine.start.y);
      this.ctx.lineTo(this.tempLine.end.x, this.tempLine.end.y);
      this.ctx.strokeStyle = '#3b82f6';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // 高亮显示附近的可连接锚点
      this.nodes.forEach(node => {
        if (node.id !== this.tempLine!.start.nodeId) {
          const anchors = node.getAnchors();
          anchors.forEach(a => {
            const dist = Math.sqrt((a.x - this.tempLine!.end.x) ** 2 + (a.y - this.tempLine!.end.y) ** 2);
            if (dist < 30) {
              this.ctx.beginPath();
              this.ctx.arc(a.x, a.y, 8, 0, Math.PI * 2);
              this.ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
              this.ctx.fill();
            }
          });
        }
      });
    }
    
    // 4. 绘制所有节点
    this.nodes.forEach(n => n.render(this.ctx));
    
    // 5. 继续下一帧渲染
    requestAnimationFrame(this.render.bind(this));
  }

  /**
   * 绘制网格背景
   */
  private drawGrid() {
    const size = 20;  // 网格间距 20px
    this.ctx.strokeStyle = '#f1f5f9';
    this.ctx.lineWidth = 1;
    
    // 绘制垂直线
    for (let x = 0; x <= this.canvas.width; x += size) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    
    // 绘制水平线
    for (let y = 0; y <= this.canvas.height; y += size) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }
  
  /**
   * 导出为 PNG 图片
   */
  public exportImage() {
    return this.canvas.toDataURL('image/png');
  }
}