import {
  DEFAULT_EVAL_SETTINGS,
  OWN_THRESHOLD_MAX,
  OPPONENT_THRESHOLD_MAX,
} from '../settings'

interface Props {
  ownThresholdCp: number
  opponentThresholdCp: number
  onSetOwn: (v: number) => void
  onSetOpponent: (v: number) => void
  onBack: () => void
}

const isDefault = (own: number, opp: number) =>
  own === DEFAULT_EVAL_SETTINGS.ownThresholdCp &&
  opp === DEFAULT_EVAL_SETTINGS.opponentThresholdCp

export function Settings({
  ownThresholdCp, opponentThresholdCp, onSetOwn, onSetOpponent, onBack,
}: Props) {
  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1>Settings</h1>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Eval-based training thresholds</div>
        <p className="settings-hint">
          How far from the engine's best move a move may be and still be accepted.
          Measured in centipawns (100&nbsp;cp = 1&nbsp;pawn). Lower is stricter.
        </p>

        <label className="settings-slider">
          <div className="settings-slider-top">
            <span>My moves — max drop</span>
            <strong>{ownThresholdCp} cp</strong>
          </div>
          <input
            type="range" min={0} max={OWN_THRESHOLD_MAX} step={5}
            value={ownThresholdCp}
            onChange={(e) => onSetOwn(Number(e.target.value))}
          />
          <div className="settings-slider-scale">
            <span>only the best move</span>
            <span>any decent move</span>
          </div>
        </label>

        <label className="settings-slider">
          <div className="settings-slider-top">
            <span>Opponent moves — max drop</span>
            <strong>{opponentThresholdCp} cp</strong>
          </div>
          <input
            type="range" min={0} max={OPPONENT_THRESHOLD_MAX} step={10}
            value={opponentThresholdCp}
            onChange={(e) => onSetOpponent(Number(e.target.value))}
          />
          <div className="settings-slider-scale">
            <span>plays only top line</span>
            <span>plays wider theory</span>
          </div>
        </label>

        <button
          className="settings-reset-btn"
          disabled={isDefault(ownThresholdCp, opponentThresholdCp)}
          onClick={() => {
            onSetOwn(DEFAULT_EVAL_SETTINGS.ownThresholdCp)
            onSetOpponent(DEFAULT_EVAL_SETTINGS.opponentThresholdCp)
          }}
        >
          Reset to defaults ({DEFAULT_EVAL_SETTINGS.ownThresholdCp} / {DEFAULT_EVAL_SETTINGS.opponentThresholdCp} cp)
        </button>
      </div>
    </div>
  )
}
