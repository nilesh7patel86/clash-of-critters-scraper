import { DATA } from '../../gameData'
import { MAX_STAR, STAR_COST, boxUrl, duplicateCost, formatCost, getGate, getStageName } from '../stats'

export function StarCostModal({ onClose }: { onClose: () => void }) {
  const rows: { start: number; end: number; cost: number; total: number }[] = []
  let start = 1
  while (start < MAX_STAR) {
    const cost = STAR_COST[start] || 0
    let end = start
    while (end + 1 < MAX_STAR && STAR_COST[end + 1] === cost) end += 1
    rows.push({ start, end, cost, total: duplicateCost(start, end + 1) })
    start = end + 1
  }
  const total = duplicateCost(1, MAX_STAR)
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="star-modal" role="dialog" aria-modal="true" aria-labelledby="star-modal-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close star cost reference">×</button>
        <h2 id="star-modal-title"><img src={boxUrl()} alt="" />Star cost reference</h2>
        <p className="modal-intro">Duplicate boxes advance one indexed star at a time. The complete 1 → {MAX_STAR} total is <strong>{formatCost(total)}</strong>.</p>
        <div className="table-scroll">
          <table className="cost-table">
            <thead><tr><th>Star transition</th><th>Boxes each</th><th>Boxes in range</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.start}><td>★{row.start} → ★{row.end + 1}</td><td className="accent-cell">{row.cost}</td><td>{formatCost(row.total)}</td></tr>)}
              <tr className="total-row"><td>★1 → ★{MAX_STAR}</td><td>—</td><td>{formatCost(total)}</td></tr>
            </tbody>
          </table>
        </div>
        <h3>Evolution gates</h3>
        <p className="modal-intro">Each value is the star gate for the next stage of that pet.</p>
        <div className="table-scroll gate-scroll">
          <table className="cost-table gate-table">
            <thead><tr><th>Tatari</th><th>Base → 2</th><th>2 → 3</th><th>3 → 4</th></tr></thead>
            <tbody>
              {DATA.pets.map((pet) => <tr key={pet.id}><td>{getStageName(pet, 1)}</td>{[1, 2, 3].map((transition) => { const gate = getGate(pet.id, transition); return <td key={transition}>{gate === null ? '—' : `★${gate}`}</td> })}</tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
