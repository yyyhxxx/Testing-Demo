/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, 
  Square, 
  Diamond, 
  Save, 
  FolderOpen, 
  CheckCircle, 
  Download, 
  Trash2, 
  Settings2,
  Layers,
  MousePointer2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CanvasEngine } from './engine/CanvasEngine';
import { NodeData, NodeType, ConnectionData } from './types';
import { cn } from '@/lib/utils';

/**
 * 流程图编辑器主应用组件
 * 
 * 功能：
 * - 从侧边栏拖拽节点到画布
 * - 从节点锚点拖拽创建连接线
 * - 编辑节点属性（文本、颜色、尺寸、位置）
 * - 保存/加载流程图（JSON 格式）
 * - 导出为 PNG 图片
 * - 流程合法性校验（检测孤立节点）
 * - 删除选中的节点或连接线
 */
export default function App() {
  // Canvas 元素引用
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Canvas 引擎实例引用（保持跨渲染周期不变）
  const engineRef = useRef<CanvasEngine | null>(null);
  
  // 状态管理
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);           // 当前选中的节点
  const [selectedConnection, setSelectedConnection] = useState<ConnectionData | null>(null); // 当前选中的连接线
  const [validationResult, setValidationResult] = useState<string | null>(null);     // 校验结果提示

  /**
   * 初始化 Canvas 引擎
   * 监听画布选中变化，同步更新 React 状态
   */
  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      // 创建引擎实例，传入状态变化回调
      engineRef.current = new CanvasEngine(canvasRef.current, () => {
        // 从引擎获取当前选中的节点和连接线
        const node = engineRef.current?.getSelectedNode();
        const conn = engineRef.current?.getSelectedConnection();

        if (node) {
          // 选中节点：更新节点状态，清空连接线状态
          setSelectedNode({
            id: node.id,
            type: node.type as NodeType,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            text: node.text,
            color: node.color
          });
          setSelectedConnection(null);
        } else if (conn) {
          // 选中连接线：更新连接线状态，清空节点状态
          setSelectedConnection({
            id: conn.id,
            sourceNodeId: conn.sourceNodeId,
            sourceAnchor: conn.sourceAnchor as any,
            targetNodeId: conn.targetNodeId,
            targetAnchor: conn.targetAnchor as any
          });
          setSelectedNode(null);
        } else {
          // 未选中任何内容
          setSelectedNode(null);
          setSelectedConnection(null);
        }
      });

      // 处理画布尺寸自适应
      const handleResize = () => {
        if (canvasRef.current) {
          canvasRef.current.width = canvasRef.current.parentElement?.clientWidth || 800;
          canvasRef.current.height = canvasRef.current.parentElement?.clientHeight || 600;
        }
      };

      window.addEventListener('resize', handleResize);
      handleResize(); // 立即执行一次

      // 清理函数：组件卸载时移除事件监听
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []); // 空依赖数组，仅在组件挂载时执行一次

  /**
   * 拖拽开始：将节点类型存储到拖拽数据中
   * @param e 拖拽事件
   * @param type 节点类型（开始/过程/判定）
   */
  const handleDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData('nodeType', type);
  };

  /**
   * 更新选中节点的属性
   * @param key 要更新的属性名
   * @param value 新值
   */
  const handlePropertyChange = (key: keyof NodeData, value: string | number) => {
    if (engineRef.current && selectedNode) {
      // 更新引擎中的节点数据
      engineRef.current.updateSelectedNode({ [key]: value });
      // 同步更新 React 状态
      setSelectedNode(prev => prev ? { ...prev, [key]: value } : null);
    }
  };

  /**
   * 保存流程图到 JSON 文件
   */
  const handleSave = () => {
    if (engineRef.current) {
      const data = engineRef.current.getData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flow-data.json';
      a.click();
      URL.revokeObjectURL(url); // 释放内存
    }
  };

  /**
   * 打开并加载 JSON 文件
   */
  const handleOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          const content = re.target?.result as string;
          try {
            const data = JSON.parse(content);
            engineRef.current?.loadData(data);
          } catch (err) {
            alert('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  /**
   * 校验流程合法性
   * 检测孤立节点（既没有输入也没有输出的节点）
   * 开始节点除外（不需要输入）
   */
  const handleValidate = () => {
    if (engineRef.current) {
      const data = engineRef.current.getData();
      
      // 找出孤立节点
      const isolatedNodes = data.nodes.filter(node => {
        if (node.type === '开始') return false; // 开始节点不需要输入
        const hasInput = data.edges.some(e => e.targetNodeId === node.id);   // 是否有入边
        const hasOutput = data.edges.some(e => e.sourceNodeId === node.id);  // 是否有出边
        return !hasInput && !hasOutput;
      });

      // 设置提示信息
      if (isolatedNodes.length > 0) {
        setValidationResult(`发现 ${isolatedNodes.length} 个孤立节点: ${isolatedNodes.map(n => n.text).join(', ')}`);
      } else {
        setValidationResult('流程合法！未发现孤立节点。');
      }
      
      // 5 秒后自动清除提示
      setTimeout(() => setValidationResult(null), 5000);
    }
  };

  /**
   * 导出当前画布为 PNG 图片
   */
  const handleExportImage = () => {
    if (engineRef.current) {
      const url = engineRef.current.exportImage();
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flow-chart.png';
      a.click();
    }
  };

  /**
   * 删除选中的节点或连接线
   */
  const handleDelete = () => {
    engineRef.current?.deleteSelected();
  };

  return (
    // TooltipProvider 为所有工具提示提供上下文支持
    <TooltipProvider>
      {/* 主容器：全屏 Flex 布局 */}
      <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
        
        {/* ==================== 左侧边栏 ==================== */}
        <aside className="w-64 border-r bg-white flex flex-col shadow-sm z-10">
          {/* Logo 区域 */}
          <div className="p-4 border-bottom flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Layers size={18} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">FlowLite</h1>
          </div>
          
          <Separator />
          
          {/* 可滚动的组件库区域 */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {/* 组件库 */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 block">组件库</Label>
                <div className="grid grid-cols-1 gap-3">
                  
                  {/* 开始节点（可拖拽） */}
                  <div 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, '开始')}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-green-50 border-green-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-green-700 group-hover:scale-110 transition-transform">
                      <Play size={18} fill="currentColor" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">开始节点</div>
                      <div className="text-xs text-slate-500">流程入口</div>
                    </div>
                  </div>

                  {/* 过程节点（可拖拽） */}
                  <div 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, '过程')}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-blue-50 border-blue-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-200 flex items-center justify-center text-blue-700 group-hover:scale-110 transition-transform">
                      <Square size={18} fill="currentColor" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">过程节点</div>
                      <div className="text-xs text-slate-500">执行步骤</div>
                    </div>
                  </div>

                  {/* 判定节点（可拖拽） */}
                  <div 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, '判定')}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-yellow-50 border-yellow-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                  >
                    {/* 旋转的菱形图标 */}
                    <div className="w-10 h-10 rotate-45 rounded-sm bg-yellow-200 flex items-center justify-center text-yellow-700 group-hover:scale-110 transition-transform">
                      <Diamond size={18} fill="currentColor" className="-rotate-45" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">判定节点</div>
                      <div className="text-xs text-slate-500">条件分支</div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 操作指南 */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 block">操作指南</Label>
                <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
                  <li>从左侧拖拽组件到画布</li>
                  <li>点击节点可编辑属性</li>
                  <li>从蓝色锚点拖拽进行连线</li>
                  <li>顶部工具栏可保存/打开文件</li>
                </ul>
              </div>
            </div>
          </ScrollArea>

          {/* 底部版本信息 */}
          <div className="p-4 border-t bg-slate-50">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <MousePointer2 size={12} />
              <span>Demo By yhx</span>
            </div>
          </div>
        </aside>

        {/* ==================== 主画布区域 ==================== */}
        <main className="flex-1 flex flex-col relative">
          
          {/* 顶部工具栏 */}
          <header className="h-14 border-b bg-white flex items-center justify-between px-4 shadow-sm z-10">
            <div className="flex items-center gap-2">
              {/* 打开文件按钮 */}
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="outline" size="icon" onClick={handleOpen}>
                    <FolderOpen size={18} />
                  </Button>
                } />
                <TooltipContent>打开项目</TooltipContent>
              </Tooltip>
              
              {/* 保存文件按钮 */}
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="outline" size="icon" onClick={handleSave}>
                    <Save size={18} />
                  </Button>
                } />
                <TooltipContent>保存项目</TooltipContent>
              </Tooltip>
              
              <Separator orientation="vertical" className="h-6 mx-1" />
              
              {/* 校验流程按钮 */}
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="outline" size="icon" onClick={handleValidate}>
                    <CheckCircle size={18} />
                  </Button>
                } />
                <TooltipContent>校验流程</TooltipContent>
              </Tooltip>

              {/* 导出图片按钮 */}
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="outline" size="icon" onClick={handleExportImage}>
                    <Download size={18} />
                  </Button>
                } />
                <TooltipContent>导出为图片</TooltipContent>
              </Tooltip>
            </div>

            {/* 校验结果提示（带动画） */}
            {validationResult && (
              <div className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300",
                validationResult.includes('合法') ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}>
                {validationResult}
              </div>
            )}

            {/* 删除按钮（仅在有选中内容时显示） */}
            <div className="flex items-center gap-2">
              {(selectedNode || selectedConnection) && (
                <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-2">
                  <Trash2 size={16} />
                  删除
                </Button>
              )}
            </div>
          </header>

          {/* Canvas 画布容器 */}
          <div className="flex-1 bg-slate-100 relative overflow-hidden">
            <canvas 
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
            />
          </div>
        </main>

        {/* ==================== 右侧属性面板 ==================== */}
        <aside className={cn(
          "w-80 border-l bg-white flex flex-col shadow-sm transition-all duration-300 z-10",
          (!selectedNode && !selectedConnection) && "translate-x-full w-0 border-none"
        )}>
          {/* 面板头部 */}
          <div className="p-4 border-b flex items-center gap-2">
            <Settings2 size={18} className="text-blue-600" />
            <h2 className="font-semibold">属性面板</h2>
          </div>

          {/* 面板内容（可滚动） */}
          <ScrollArea className="flex-1">
            
            {/* 节点属性编辑表单 */}
            {selectedNode && (
              <div className="p-6 space-y-6">
                {/* 显示文本 */}
                <div className="space-y-2">
                  <Label htmlFor="node-text">显示文本</Label>
                  <Input 
                    id="node-text" 
                    value={selectedNode.text} 
                    onChange={(e) => handlePropertyChange('text', e.target.value)}
                  />
                </div>

                {/* 背景颜色（色块 + 文本输入） */}
                <div className="space-y-2">
                  <Label htmlFor="node-color">背景颜色</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="node-color" 
                      type="color"
                      value={selectedNode.color} 
                      onChange={(e) => handlePropertyChange('color', e.target.value)}
                      className="w-12 h-10 p-1"
                    />
                    <Input 
                      value={selectedNode.color} 
                      onChange={(e) => handlePropertyChange('color', e.target.value)}
                      className="flex-1 font-mono"
                    />
                  </div>
                </div>

                {/* 宽高 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="node-width">宽度</Label>
                    <Input 
                      id="node-width" 
                      type="number"
                      value={selectedNode.width} 
                      onChange={(e) => handlePropertyChange('width', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="node-height">高度</Label>
                    <Input 
                      id="node-height" 
                      type="number"
                      value={selectedNode.height} 
                      onChange={(e) => handlePropertyChange('height', parseInt(e.target.value))}
                    />
                  </div>
                </div>

                {/* 坐标位置 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="node-x">坐标 X</Label>
                    <Input 
                      id="node-x" 
                      type="number"
                      value={Math.round(selectedNode.x)} 
                      onChange={(e) => handlePropertyChange('x', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="node-y">坐标 Y</Label>
                    <Input 
                      id="node-y" 
                      type="number"
                      value={Math.round(selectedNode.y)} 
                      onChange={(e) => handlePropertyChange('y', parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <Separator />
                
                {/* 删除节点按钮 */}
                <Button variant="destructive" className="w-full gap-2" onClick={handleDelete}>
                  <Trash2 size={16} />
                  删除节点
                </Button>
              </div>
            )}

            {/* 连接线信息展示（只读） */}
            {selectedConnection && (
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  {/* 源节点信息 */}
                  <div className="p-3 rounded-lg bg-slate-50 border space-y-2">
                    <div className="text-xs font-semibold text-slate-500 uppercase">源节点</div>
                    <div className="text-sm font-medium truncate">
                      {engineRef.current?.getNodes().find(n => n.id === selectedConnection.sourceNodeId)?.text || '未知节点'}
                    </div>
                    <div className="text-xs text-slate-400">锚点: {selectedConnection.sourceAnchor}</div>
                  </div>

                  {/* 连接线中间的分隔线 */}
                  <div className="flex justify-center">
                    <div className="h-4 w-px bg-slate-200" />
                  </div>

                  {/* 目标节点信息 */}
                  <div className="p-3 rounded-lg bg-slate-50 border space-y-2">
                    <div className="text-xs font-semibold text-slate-500 uppercase">目标节点</div>
                    <div className="text-sm font-medium truncate">
                      {engineRef.current?.getNodes().find(n => n.id === selectedConnection.targetNodeId)?.text || '未知节点'}
                    </div>
                    <div className="text-xs text-slate-400">锚点: {selectedConnection.targetAnchor}</div>
                  </div>
                </div>

                <Separator />

                {/* 删除连线按钮 */}
                <Button variant="destructive" className="w-full gap-2" onClick={handleDelete}>
                  <Trash2 size={16} />
                  删除连线
                </Button>
              </div>
            )}
          </ScrollArea>
        </aside>
      </div>
    </TooltipProvider>
  );
}