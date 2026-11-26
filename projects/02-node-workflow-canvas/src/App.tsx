import { useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { NodeKind, Operation, WorkflowEdge, WorkflowNode } from './types'

const NODE_WIDTH = 180
const NODE_HEIGHT = 96

const initialNodes: WorkflowNode[] = [
  {
    id: 'n1',
    kind: 'input',
    title: '输入文本',
    x: 60,
    y: 90,
    status: 'idle',
    params: { text: 'hello pipeline', operation: 'uppercase' },
  },
  {
    id: 'n2',
    kind: 'process',
    title: '文本处理',
    x: 310,
    y: 90,
    status: 'idle',
    params: { text: '', operation: 'uppercase' },
  },
  {
    id: 'n3',
    kind: 'output',
    title: '输出结果',
    x: 560,
    y: 90,
    status: 'idle',
    params: { text: '', operation: 'uppercase' },
  },
]

const initialEdges: WorkflowEdge[] = [
  { id: 'e1', from: 'n1', to: 'n2' },
  { id: 'e2', from: 'n2', to: 'n3' },
]

const kindLabel: Record<NodeKind, string> = {
  input: '输入',
  process: '处理',
  output: '输出',
}

const statusLabel: Record<WorkflowNode['status'], string> = {
  idle: '待运行',
  running: '运行中',
  done: '完成',
  error: '失败',
}

function topoOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  edges.forEach((edge) => indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1))

  const queue = nodes.filter((node) => indegree.get(node.id) === 0)
  const ordered: WorkflowNode[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    ordered.push(current)
    edges
      .filter((edge) => edge.from === current.id)
      .forEach((edge) => {
        const next = (indegree.get(edge.to) ?? 0) - 1
        indegree.set(edge.to, next)
        if (next === 0) {
          const target = nodes.find((node) => node.id === edge.to)
          if (target) queue.push(target)
        }
      })
  }
  return ordered
}

function edgePath(from: WorkflowNode, to: WorkflowNode): string {
  const x1 = from.x + NODE_WIDTH
  const y1 = from.y + NODE_HEIGHT / 2
  const x2 = to.x
  const y2 = to.y + NODE_HEIGHT / 2
  const bend = Math.max(40, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}

export default function App() {
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes)
  const [edges, setEdges] = useState<WorkflowEdge[]>(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>('n2')
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [isRunning, setIsRunning] = useState(false)
  const [message, setMessage] = useState('点击「运行工作流」查看节点状态流转')
  const [finalOutput, setFinalOutput] = useState('')

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const selected = nodes.find((node) => node.id === selectedId) ?? null

  function addNode(kind: NodeKind) {
    const id = `n${Date.now().toString(36)}`
    const count = nodes.length
    const node: WorkflowNode = {
      id,
      kind,
      title: `新${kindLabel[kind]}节点`,
      x: 80 + (count % 4) * 60,
      y: 230 + (count % 3) * 40,
      status: 'idle',
      params: {
        text: kind === 'input' ? '输入内容' : '',
        operation: 'uppercase',
      },
    }
    setNodes((prev) => [...prev, node])
    setSelectedId(id)
    setMessage(`已添加${kindLabel[kind]}节点，可拖动并在右侧配置参数`)
  }

  function patchNode(id: string, patch: Partial<WorkflowNode>) {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)))
  }

  function deleteSelected() {
    if (!selectedId) return
    setNodes((prev) => prev.filter((node) => node.id !== selectedId))
    setEdges((prev) => prev.filter((edge) => edge.from !== selectedId && edge.to !== selectedId))
    setSelectedId(null)
    setMessage('已删除选中节点及其连线')
  }

  function handlePort(nodeId: string, direction: 'in' | 'out') {
    if (direction === 'out') {
      setConnectingFrom(nodeId)
      setMessage('已选择起点，请点击另一个节点的输入端口完成连线')
      return
    }
    if (!connectingFrom || connectingFrom === nodeId) return
    const exists = edges.some((edge) => edge.from === connectingFrom && edge.to === nodeId)
    if (!exists) {
      setEdges((prev) => [
        ...prev,
        { id: `e${Date.now().toString(36)}`, from: connectingFrom, to: nodeId },
      ])
      setMessage('连线已创建')
    }
    setConnectingFrom(null)
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    setPointer({ x, y })
    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current
      setNodes((prev) =>
        prev.map((node) => (node.id === id ? { ...node, x: x - dx, y: y - dy } : node)),
      )
    }
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>, node: WorkflowNode) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      id: node.id,
      dx: event.clientX - rect.left - node.x,
      dy: event.clientY - rect.top - node.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedId(node.id)
  }

  async function runWorkflow() {
    if (isRunning) return
    setIsRunning(true)
    setFinalOutput('')
    setMessage('开始执行：按拓扑顺序逐节点运行')

    const order = topoOrder(nodes, edges)
    if (order.length !== nodes.length) {
      setMessage('检测到环路，无法完成拓扑排序；请检查连线')
      setIsRunning(false)
      return
    }

    const values = new Map<string, string>()
    setNodes((prev) => prev.map((node) => ({ ...node, status: 'idle', result: undefined })))

    for (const node of order) {
      patchNode(node.id, { status: 'running' })
      await new Promise((resolve) => setTimeout(resolve, 420))

      const incoming = edges
        .filter((edge) => edge.to === node.id)
        .map((edge) => values.get(edge.from) ?? '')
        .join('')

      let value = incoming
      if (node.kind === 'input') {
        value = node.params.text
      } else if (node.kind === 'process') {
        const operation: Operation = node.params.operation
        if (operation === 'uppercase') value = incoming.toUpperCase()
        else if (operation === 'prefix') value = `processed://${incoming}`
        else value = incoming.split('').reverse().join('')
      }

      values.set(node.id, value)
      patchNode(node.id, { status: 'done', result: value })
    }

    const outputNode = [...order].reverse().find((node) => node.kind === 'output')
    const output = outputNode ? values.get(outputNode.id) ?? '' : ''
    setFinalOutput(output)
    setMessage(`执行完成：共 ${order.length} 个节点`)
    setIsRunning(false)
  }

  function exportJSON() {
    const data = JSON.stringify({ nodes, edges }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'workflow.json'
    link.click()
    URL.revokeObjectURL(url)
    setMessage('已导出 workflow.json')
  }

  function importJSON(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as {
          nodes: WorkflowNode[]
          edges: WorkflowEdge[]
        }
        setNodes(data.nodes)
        setEdges(data.edges)
        setSelectedId(null)
        setMessage(`已导入 ${data.nodes.length} 个节点、${data.edges.length} 条连线`)
      } catch {
        setMessage('导入失败：JSON 格式不正确')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>节点式工作流画布</h1>
          <p>拖拽节点 · 点击端口连线 · 右侧配置参数 · 运行查看状态</p>
        </div>
        <div className="actions">
          <button onClick={() => addNode('input')}>+ 输入</button>
          <button onClick={() => addNode('process')}>+ 处理</button>
          <button onClick={() => addNode('output')}>+ 输出</button>
          <button className="primary" onClick={runWorkflow} disabled={isRunning}>
            {isRunning ? '运行中…' : '运行工作流'}
          </button>
          <button onClick={() => setEdges([])}>清空连线</button>
          <button onClick={exportJSON}>导出 JSON</button>
          <label className="file-button">
            导入 JSON
            <input type="file" accept="application/json" onChange={importJSON} />
          </label>
        </div>
      </header>

      <main className="workspace">
        <div
          className="canvas"
          ref={canvasRef}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onPointerDown={() => setSelectedId(null)}
        >
          <svg className="edge-layer" width="100%" height="100%">
            {edges.map((edge) => {
              const from = nodes.find((node) => node.id === edge.from)
              const to = nodes.find((node) => node.id === edge.to)
              if (!from || !to) return null
              return (
                <g key={edge.id}>
                  <path d={edgePath(from, to)} className="edge" />
                  <circle cx={to.x} cy={to.y + NODE_HEIGHT / 2} r="4" className="edge-dot" />
                </g>
              )
            })}
            {connectingFrom &&
              (() => {
                const from = nodes.find((node) => node.id === connectingFrom)
                if (!from) return null
                return (
                  <path
                    d={`M ${from.x + NODE_WIDTH} ${from.y + NODE_HEIGHT / 2} L ${pointer.x} ${pointer.y}`}
                    className="edge pending"
                  />
                )
              })()}
          </svg>

          {nodes.map((node) => (
            <div
              key={node.id}
              className={`node ${node.kind} ${node.status} ${selectedId === node.id ? 'selected' : ''}`}
              style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
              onPointerDown={(event) => {
                event.stopPropagation()
                startDrag(event, node)
              }}
            >
              <div className="node-header">
                <span className="node-kind">{kindLabel[node.kind]}</span>
                <strong>{node.title}</strong>
                <span className={`status status-${node.status}`}>{statusLabel[node.status]}</span>
              </div>
              <div className="node-body">
                {node.kind === 'input' ? (
                  <span className="preview">{node.params.text}</span>
                ) : node.kind === 'process' ? (
                  <span className="preview">操作：{node.params.operation}</span>
                ) : (
                  <span className="preview">{node.result || '等待输入'}</span>
                )}
              </div>
              {node.kind !== 'input' && (
                <button
                  className="port port-in"
                  title="输入端口"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handlePort(node.id, 'in')}
                />
              )}
              {node.kind !== 'output' && (
                <button
                  className="port port-out"
                  title="输出端口"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handlePort(node.id, 'out')}
                />
              )}
            </div>
          ))}
        </div>

        <aside className="panel">
          <h2>属性面板</h2>
          {!selected ? (
            <p className="hint">点击画布中的节点以编辑参数</p>
          ) : (
            <>
              <label>
                节点名称
                <input
                  value={selected.title}
                  onChange={(event) => patchNode(selected.id, { title: event.target.value })}
                />
              </label>
              <label>
                类型
                <input value={kindLabel[selected.kind]} readOnly />
              </label>
              {selected.kind === 'input' && (
                <label>
                  输入内容
                  <input
                    value={selected.params.text}
                    onChange={(event) =>
                      patchNode(selected.id, {
                        params: { ...selected.params, text: event.target.value },
                      })
                    }
                  />
                </label>
              )}
              {selected.kind === 'process' && (
                <label>
                  处理操作
                  <select
                    value={selected.params.operation}
                    onChange={(event) =>
                      patchNode(selected.id, {
                        params: {
                          ...selected.params,
                          operation: event.target.value as Operation,
                        },
                      })
                    }
                  >
                    <option value="uppercase">转大写</option>
                    <option value="prefix">加前缀</option>
                    <option value="reverse">反转字符</option>
                  </select>
                </label>
              )}
              <label>
                运行状态
                <input value={statusLabel[selected.status]} readOnly />
              </label>
              <label>
                节点输出
                <textarea value={selected.result ?? ''} readOnly rows={3} />
              </label>
              <button className="danger" onClick={deleteSelected}>
                删除节点
              </button>
            </>
          )}

          <div className="status-box">
            <h3>执行信息</h3>
            <p>{message}</p>
            {finalOutput && (
              <p className="final-output">
                最终结果：<code>{finalOutput}</code>
              </p>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}
