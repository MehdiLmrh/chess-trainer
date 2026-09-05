import { RUN_MAX_LIVES, type RunStats } from '../run'

export function RunHud({ stats }: { stats: RunStats }) {
  return (
    <div className="run-hud">
      <div className="run-hud-lives">
        {Array.from({ length: RUN_MAX_LIVES }).map((_, i) => (
          <span key={i} className={`run-life${i < stats.lives ? '' : ' run-life-lost'}`}>♥</span>
        ))}
      </div>
      <div className="run-hud-score">{stats.score} pts</div>
      {stats.combo >= 3 && <div className="run-hud-combo">🔥 {stats.combo}x</div>}
    </div>
  )
}

interface SummaryProps {
  stats: RunStats
  onRetry: () => void
  onBack: () => void
}

export function RunSummary({ stats, onRetry, onBack }: SummaryProps) {
  return (
    <div className="run-summary">
      <div className="run-summary-title">💀 Run Over</div>
      <div className="run-summary-score">{stats.score}<span> pts</span></div>
      <div className="run-summary-stats">
        <div className="run-summary-stat">
          <span className="run-summary-val">{stats.correctMoves}</span>
          <span className="run-summary-label">moves played</span>
        </div>
        <div className="run-summary-stat">
          <span className="run-summary-val">{stats.openingsCleared}</span>
          <span className="run-summary-label">openings cleared</span>
        </div>
        <div className="run-summary-stat">
          <span className="run-summary-val">{stats.bestCombo}</span>
          <span className="run-summary-label">best streak</span>
        </div>
      </div>
      <div className="run-summary-actions">
        <button className="start-btn" onClick={onRetry}>🏃 Run again</button>
        <button className="back-btn" onClick={onBack}>← Back to menu</button>
      </div>
    </div>
  )
}
