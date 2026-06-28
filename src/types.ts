export interface TheoryMove {
  move: string
  variation: string
  eval?: number  // centipawns from white's perspective of the resulting position
}

export interface TheoryNode {
  opening: string
  moves: TheoryMove[]
}

export type TheoryDB = Record<string, TheoryNode>

export type Side = 'white' | 'black'

export type FeedbackStatus = 'idle' | 'correct' | 'correct-best' | 'too-weak' | 'wrong' | 'out-of-theory' | 'end-of-theory'
