export type NodeKind = 'input' | 'process' | 'output'
export type NodeStatus = 'idle' | 'running' | 'done' | 'error'
export type Operation = 'uppercase' | 'prefix' | 'reverse'

export interface WorkflowNode {
  id: string
  kind: NodeKind
  title: string
  x: number
  y: number
  status: NodeStatus
  params: {
    text: string
    operation: Operation
  }
  result?: string
}

export interface WorkflowEdge {
  id: string
  from: string
  to: string
}
