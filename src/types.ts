export interface TheoryMove {
  move: string
  variation: string
}

export interface TheoryNode {
  opening: string
  moves: TheoryMove[]
}

export type TheoryDB = Record<string, TheoryNode>

export type Side = 'white' | 'black'

export type FeedbackStatus = 'idle' | 'correct' | 'wrong' | 'out-of-theory' | 'end-of-theory'
