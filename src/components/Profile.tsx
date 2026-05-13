import type { StatsDB } from '../stats'
import { accuracy } from '../stats'
import type { ExclusionsDB } from '../exclusions'
import '../Profile.css'

interface Props {
  stats: StatsDB
  exclusions: ExclusionsDB
  onBack: () => void
  onClear: () => void
  onReinclude: (opening: string, variation: string) => void
}

export function Profile({ stats, exclusions, onBack, onClear, onReinclude }: Props) {
  const statsEntries = Object.entries(stats).sort((a, b) => b[1].played - a[1].played)
  const exclusionEntries = Object.entries(exclusions).filter(([, v]) => v.length > 0)

  return (
    <div className="profile">
      <div className="profile-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1>Profile</h1>
        <button className="clear-btn" onClick={onClear}>Clear stats</button>
      </div>

      {statsEntries.length === 0 ? (
        <p className="no-stats">No sessions yet — start training to see stats.</p>
      ) : (
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Opening</th>
                <th title="Training sessions started">Played</th>
                <th title="Reached end of theory">Completed</th>
                <th title="Completed with zero mistakes">Perfect</th>
                <th title="Correct moves / total attempts">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {statsEntries.map(([name, s]) => (
                <tr key={name}>
                  <td className="opening-name">{name}</td>
                  <td>{s.played}</td>
                  <td>{s.completed}</td>
                  <td className={s.perfect > 0 ? 'highlight' : ''}>{s.perfect}</td>
                  <td>{accuracy(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {exclusionEntries.length > 0 && (
        <div className="exclusions-section">
          <h2>Excluded variations</h2>
          {exclusionEntries.map(([opening, variations]) => (
            <div key={opening} className="exclusion-group">
              <p className="exclusion-opening">{opening}</p>
              <ul className="exclusion-list">
                {variations.map((v) => (
                  <li key={v}>
                    <span>{v}</span>
                    <button
                      className="reinclude-btn"
                      onClick={() => onReinclude(opening, v)}
                    >
                      Re-include
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
