import React from 'react';
import { useGame } from '../store';
import { Panel, PlayerLink, PosTag } from '../components/common';
import { fmtMoney } from '../util';
import { ticketPrice } from '../../engine/finance';

export function Finances() {
  const state = useGame();
  const club = state.clubs[state.manager.clubId];
  const players = club.players.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.wage - a.wage);
  const wages = players.reduce((s, p) => s + p.wage, 0);
  const leagueTv = club.nation === 'ENG' ? 2.4e6 : club.nation === 'ESP' ? 1.5e6 : club.nation === 'GER' ? 1.2e6 : club.nation === 'ITA' ? 1.2e6 : 0.6e6;
  const commercial = Math.pow(club.reputation / 100, 3) * 5e6 + club.capacity * 3;
  const gate = club.capacity * 0.85 * ticketPrice(club.reputation) * 19 / 52;
  const weeklyIn = leagueTv + commercial + gate;
  const seasonSpend = state.transfers.filter((t) => t.toId === club.id && t.season === `${state.seasonYear}/${String(state.seasonYear + 1).slice(2)}`).reduce((s, t) => s + t.fee, 0);
  const seasonIncome = state.transfers.filter((t) => t.fromId === club.id && t.season === `${state.seasonYear}/${String(state.seasonYear + 1).slice(2)}`).reduce((s, t) => s + t.fee, 0);
  return (
    <div className="grid grid2">
      <div className="col gap12">
        <div className="row wrap gap12">
          <div className="stat-tile"><div className="v" style={{ color: club.balance < 0 ? 'var(--red)' : 'var(--green)' }}>{fmtMoney(club.balance)}</div><div className="l">Bank balance</div></div>
          <div className="stat-tile"><div className="v">{fmtMoney(club.transferBudget)}</div><div className="l">Transfer budget</div></div>
          <div className="stat-tile"><div className="v" style={{ color: wages > club.wageBudget ? 'var(--red)' : undefined }}>{fmtMoney(wages)}</div><div className="l">Wages / week</div></div>
          <div className="stat-tile"><div className="v">{fmtMoney(club.wageBudget)}</div><div className="l">Wage budget</div></div>
        </div>
        <Panel title="Weekly projection (approx.)">
          <div className="kv">
            <span className="k">Broadcasting</span><span className="mono green">+{fmtMoney(leagueTv)}</span>
            <span className="k">Commercial & sponsorship</span><span className="mono green">+{fmtMoney(commercial)}</span>
            <span className="k">Matchday (averaged)</span><span className="mono green">+{fmtMoney(gate)}</span>
            <span className="k">Wages</span><span className="mono red">−{fmtMoney(wages)}</span>
            <span className="k bold">Net per week</span><span className={`mono bold ${weeklyIn - wages >= 0 ? 'green' : 'red'}`}>{weeklyIn - wages >= 0 ? '+' : '−'}{fmtMoney(Math.abs(weeklyIn - wages))}</span>
          </div>
          <div className="tiny dim mt8">Prize money and European bonuses are paid per match and at the end of the season. Ticket price: €{ticketPrice(club.reputation)}.</div>
        </Panel>
        <Panel title="Transfer activity this season">
          <div className="kv"><span className="k">Spent</span><span className="mono red">{fmtMoney(seasonSpend)}</span><span className="k">Received</span><span className="mono green">{fmtMoney(seasonIncome)}</span><span className="k">Net</span><span className="mono">{fmtMoney(seasonIncome - seasonSpend)}</span></div>
        </Panel>
      </div>
      <Panel title="Wage bill" tight>
        <table className="tbl"><thead><tr><th>Pos</th><th>Player</th><th className="num">Wage</th><th className="num">Until</th><th className="num">Value</th></tr></thead>
          <tbody>{players.map((p) => <tr key={p.id}><td><PosTag pos={p.pos} /></td><td><PlayerLink p={p} showFlag={false} /></td><td className="num">{fmtMoney(p.wage)}</td><td className="num">{p.contractEnd}</td><td className="num">{fmtMoney(p.value)}</td></tr>)}</tbody>
        </table>
      </Panel>
    </div>
  );
}
