/**
 * 流程图编辑器类型定义文件
 * 
 * 定义了整个应用的核心数据结构：
 * - 节点类型和锚点方向
 * - 节点、连接线、流程图的数据结构
 */

/**
 * 节点类型
 * - '开始': 流程起点（绿色圆角矩形）
 * - '过程': 执行步骤（蓝色矩形）
 * - '判定': 条件分支（黄色菱形）
 */
export type NodeType = '开始' | '过程' | '判定';

/**
 * 锚点位置（连接点方向）
 * 节点上的四个连接点，用于连接线的起点或终点
 */
export type AnchorPosition = '上' | '下' | '左' | '右';

/**
 * 锚点接口
 * 代表节点上的一个具体连接点
 */
export interface Anchor {
  id: string;              // 锚点唯一标识，格式: "{nodeId}-{position}"
  nodeId: string;          // 所属节点的 ID
  position: AnchorPosition; // 锚点方向（上/下/左/右）
  x: number;               // 锚点在画布上的 X 坐标（实时计算）
  y: number;               // 锚点在画布上的 Y 坐标（实时计算）
}

/**
 * 节点数据接口
 * 用于保存/加载节点，以及属性面板编辑
 */
export interface NodeData {
  id: string;       // 唯一标识符（使用 crypto.randomUUID() 生成）
  type: NodeType;   // 节点类型（决定形状）
  x: number;        // 中心点 X 坐标
  y: number;        // 中心点 Y 坐标
  width: number;    // 宽度（像素）
  height: number;   // 高度（像素）
  text: string;     // 节点上显示的文本
  color: string;    // 填充颜色（十六进制，如 "#bbf7d0"）
}

/**
 * 连接线数据接口
 * 定义两个节点之间的连接关系
 */
export interface ConnectionData {
  id: string;                 // 唯一标识符
  sourceNodeId: string;       // 源节点 ID
  sourceAnchor: AnchorPosition; // 源节点上的锚点方向
  targetNodeId: string;       // 目标节点 ID
  targetAnchor: AnchorPosition; // 目标节点上的锚点方向
  midRatio?: number;          // 中间控制点位置（0-1），仅对 3 段线有效
                              // 默认值为 0.5（中点），用户拖拽中间段时动态变化
}

/**
 * 流程图完整数据接口
 * 用于保存/加载整个流程图
 */
export interface FlowData {
  nodes: NodeData[];       // 所有节点
  edges: ConnectionData[]; // 所有连接线
}