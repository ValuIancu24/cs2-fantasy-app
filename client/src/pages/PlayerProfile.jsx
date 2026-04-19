import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell, LabelList,
  PieChart, Pie, Legend,
} from 'recharts';
import { AuthContext } from '../context/AuthContext.jsx';
import '../styles/players.css';

function fmtPrice(price) {
  return `${Math.round((price ?? 190000) / 1000)}K`;
}

function fmtDate(str) {
  if (!str) return '?';
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function ChartSelector({ selector, setSelector, options, singleTournament, singleName }) {
  if (singleTournament) {
    return <span className="chart-selector-label">{singleName}</span>;
  }
  return (
    <div className="chart-selector">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`chart-selector-btn${selector === opt.value ? ' active' : ''}`}
          onClick={() => setSelector(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function makeBarLabel(barData, shouldRender) {
  return ({ x, y, width, height, index, value }) => {
    if (!value) return null;
    const d = barData[index];
    if (!d || !shouldRender(d)) return null;
    const total = d.total_pts;
    const labelY = value > 0 ? y - 6 : y + height + 12;
    return (
      <text x={x + width / 2} y={labelY} textAnchor="middle" fill="#e9d5ff" fontSize={10} fontWeight={700}>
        {total > 0 ? `+${total}` : `${total}`}
      </text>
    );
  };
}

function buildSeries(tournaments, selector) {
  if (!tournaments.length) return [];
  if (selector === 'last2') {
    const older = tournaments[1]?.series || [];
    const newer = tournaments[0]?.series || [];
    return [...older, ...newer];
  }
  return tournaments[parseInt(selector)]?.series || [];
}

function PlayerProfile() {
  const { tournamentId, playerId } = useParams();
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [player, setPlayer] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sel1, setSel1] = useState('last2');
  const [sel3, setSel3] = useState('last2');
  const [sel4, setSel4] = useState('last2');

  const hoveredBarRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${apiBase}/players/${playerId}?tournament_id=${tournamentId}`)
        .then(r => r.ok ? r.json() : null),
      fetch(`${apiBase}/players/${playerId}/stats?tournament_id=${tournamentId}`)
        .then(r => r.ok ? r.json() : null),
    ])
      .then(([playerData, stats]) => {
        if (playerData) setPlayer(playerData);
        if (stats) setStatsData(stats);
      })
      .finally(() => setLoading(false));
  }, [apiBase, playerId, tournamentId]);

  const tournaments = statsData?.tournaments || [];
  const hasTournaments = tournaments.length > 0;
  const singleTournament = tournaments.length === 1;

  const selectorOptions = useMemo(() => {
    if (tournaments.length < 2) return [];
    return [
      { value: 'last2', label: 'Last 2 tournaments' },
      { value: '0',     label: tournaments[0]?.name || 'Tournament 1' },
      { value: '1',     label: tournaments[1]?.name || 'Tournament 2' },
    ];
  }, [tournaments]);

  const singleName = tournaments[0]?.name || '';

  // Chart 1 — line
  const series1 = useMemo(() => buildSeries(tournaments, sel1), [tournaments, sel1]);
  const lineData = useMemo(() =>
    series1.map((s, i) => ({ ...s, idx: i, date: fmtDate(s.scheduled_at) })),
    [series1]
  );
  const splitIdx1 = (sel1 === 'last2' && tournaments.length === 2)
    ? (tournaments[1]?.series?.length || 0) - 0.5
    : null;

  // Chart 2 — radar always uses last 2
  const radarSeries = useMemo(() => {
    const older = tournaments[1]?.series || [];
    const newer = tournaments[0]?.series || [];
    return [...older, ...newer];
  }, [tournaments]);

  const radarData = useMemo(() => {
    if (!radarSeries.length) return [];
    const n = radarSeries.length;
    const avg = key => radarSeries.reduce((s, r) => s + (r[key] || 0), 0) / n;
    return [
      { subject: 'Kills',    value: +avg('kills').toFixed(1) },
      { subject: 'Assists',  value: +avg('assists').toFixed(1) },
      { subject: 'Deaths',   value: +avg('deaths').toFixed(1) },
      { subject: 'Perf Pts', value: +avg('kda_pts').toFixed(1) },
      { subject: 'Team Pts', value: +avg('team_pts').toFixed(1) },
    ];
  }, [radarSeries]);

  // Chart 3 — vertical bar
  const series3 = useMemo(() => buildSeries(tournaments, sel3), [tournaments, sel3]);
  const barData = useMemo(() => series3.map(s => ({
    ...s,
    dateLabel: fmtDate(s.scheduled_at),
    seg_kda_pos:  Math.max(s.kda_pts || 0, 0),
    seg_team_pos: s.team_win === 1 ? 15 : 0,
    seg_kda_neg:  Math.min(s.kda_pts || 0, 0),
    seg_team_neg: s.team_win === 0 ? -15 : 0,
  })), [series3]);

  const labelKdaPos  = useMemo(() => makeBarLabel(barData, d => d.team_win !== 1 && d.kda_pts > 0), [barData]);
  const labelTeamPos = useMemo(() => makeBarLabel(barData, d => d.team_win === 1), [barData]);
  const labelKdaNeg  = useMemo(() => makeBarLabel(barData, d => d.team_win === null && d.kda_pts < 0), [barData]);
  const labelTeamNeg = useMemo(() => makeBarLabel(barData, d => d.team_win === 0 && d.kda_pts <= 0), [barData]);

  // Chart 4 — doughnut
  const series4 = useMemo(() => buildSeries(tournaments, sel4), [tournaments, sel4]);
  const doughnutData = useMemo(() => {
    const wins   = series4.filter(s => s.team_win === 1).length;
    const losses = series4.filter(s => s.team_win === 0).length;
    const out = [];
    if (wins)   out.push({ name: 'Wins',   value: wins });
    if (losses) out.push({ name: 'Losses', value: losses });
    return out;
  }, [series4]);

  useEffect(() => {
    const scrollTo = location.state?.scrollTo;
    if (!scrollTo || loading) return;
    const el = document.getElementById(scrollTo);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.state?.scrollTo, loading]);

  const navigateToSeries = (s, chartId) => {
    if (s?.series_id && s?.tournament_id) {
      navigate(`/tournament/${s.tournament_id}/matches/${s.series_id}`, {
        state: { from: 'player', backUrl: location.pathname + location.search, scrollTo: chartId },
      });
    }
  };

  // ── Custom tooltips ──────────────────────────────────────────────────────────

  const renderLineTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const score = d.team1_score != null ? `${d.team1_score}–${d.team2_score}` : '?';
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-title">{d.team1_name} {score} {d.team2_name}</div>
        <div>K/D/A: {d.kills}/{d.deaths}/{d.assists}</div>
        <div>Fantasy pts: <strong>{d.total_pts}</strong></div>
      </div>
    );
  };

  const renderBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const score = d.team1_score != null ? `${d.team1_score}–${d.team2_score}` : '?';
    const hovered = hoveredBarRef.current;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-title">{d.team1_name} {score} {d.team2_name}</div>
        <div>K/D/A: {d.kills}/{d.deaths}/{d.assists}</div>
        {hovered === 'kda'
          ? <div>Perf pts: <strong>{d.kda_pts}</strong></div>
          : <div>Team pts: <strong>{d.team_pts > 0 ? '+' : ''}{d.team_pts}</strong></div>
        }
        <div>Total: <strong>{d.total_pts}</strong></div>
      </div>
    );
  };

  const renderDoughnutTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const total = doughnutData.reduce((s, r) => s + r.value, 0);
    const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
    return (
      <div className="chart-tooltip">
        <div>{d.name}: <strong>{d.value}</strong> matches ({pct}%)</div>
      </div>
    );
  };

  const renderRadarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="chart-tooltip">
        <div>{d.payload.subject}: <strong>{d.value}</strong></div>
      </div>
    );
  };

  return (
    <div className="player-profile-page">
      <button className="btn-text" type="button" onClick={() => navigate(-1)}>← Back</button>

      {loading && <p className="muted" style={{ marginTop: '1rem' }}>Loading...</p>}
      {!loading && !player && <p className="muted" style={{ marginTop: '1rem' }}>Player not found.</p>}

      {player && (
        <div className="player-profile-header panel">
          <h1 className="player-profile-name">{player.nickname}</h1>
          <span className="muted player-profile-team">{player.team_name || '—'}</span>
          <span className="player-price player-profile-price">{fmtPrice(player.price)}</span>
        </div>
      )}

      {player && !loading && hasTournaments && (
        <div className="charts-grid">

          {/* Chart 1 — Line: Fantasy Points per Match */}
          <div id="chart-line" className="chart-panel">
            <div className="chart-title">
              Fantasy Points per Match
              <div className="chart-selector-inline">
                <ChartSelector
                  selector={sel1} setSelector={setSel1}
                  options={selectorOptions}
                  singleTournament={singleTournament} singleName={singleName}
                />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={440}>
              <LineChart
                data={lineData}
                style={{ cursor: 'pointer' }}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis
                  dataKey="idx"
                  type="number"
                  domain={[-0.5, Math.max(lineData.length - 0.5, 0.5)]}
                  ticks={lineData.map(d => d.idx)}
                  tickFormatter={i => lineData[i]?.date || ''}
                  tick={{ fill: '#c4b5fd', fontSize: 10 }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip content={renderLineTooltip} />
                {splitIdx1 !== null && (
                  <ReferenceLine x={splitIdx1} stroke="rgba(210,168,255,0.4)" strokeDasharray="4 3" />
                )}
                <Line
                  type="monotone"
                  dataKey="total_pts"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={{ fill: '#a78bfa', r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#c4b5fd', onClick: (_, payload) => navigateToSeries(payload?.payload, 'chart-line') }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 — Radar: Average Stats (always last 2, no selector) */}
          <div className="chart-panel">
            <div className="chart-title">
              Average Stats
              <span className="chart-subtitle">
                {singleTournament ? tournaments[0].name : 'Last 2 tournaments'}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={440}>
              <RadarChart data={radarData} outerRadius="72%" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#c4b5fd', fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fill: 'rgba(196,181,253,0.4)', fontSize: 8 }} />
                <Radar dataKey="value" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.25} isAnimationActive={false} />
                <Tooltip content={renderRadarTooltip} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 3 — Vertical Bar: Points Breakdown */}
          <div id="chart-bar" className="chart-panel">
            <div className="chart-title">
              Points Breakdown per Match
              <div className="chart-selector-inline">
                <ChartSelector
                  selector={sel3} setSelector={setSel3}
                  options={selectorOptions}
                  singleTournament={singleTournament} singleName={singleName}
                />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={440}>
              <BarChart
                data={barData}
                style={{ cursor: 'pointer' }}
                margin={{ top: 24, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="dateLabel" tick={{ fill: '#c4b5fd', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                <Tooltip content={renderBarTooltip} />
                <Bar dataKey="seg_kda_pos" stackId="a" fill="#a78bfa"
                  onMouseEnter={() => { hoveredBarRef.current = 'kda'; }}
                  onClick={d => navigateToSeries(d, 'chart-bar')}
                  isAnimationActive={false}>
                  <LabelList content={labelKdaPos} />
                </Bar>
                <Bar dataKey="seg_team_pos" stackId="a" fill="#22c55e"
                  onMouseEnter={() => { hoveredBarRef.current = 'team'; }}
                  onClick={d => navigateToSeries(d, 'chart-bar')}
                  isAnimationActive={false}>
                  <LabelList content={labelTeamPos} />
                </Bar>
                <Bar dataKey="seg_kda_neg" stackId="a" fill="#a78bfa"
                  onMouseEnter={() => { hoveredBarRef.current = 'kda'; }}
                  onClick={d => navigateToSeries(d, 'chart-bar')}
                  isAnimationActive={false}>
                  <LabelList content={labelKdaNeg} />
                </Bar>
                <Bar dataKey="seg_team_neg" stackId="a" fill="#ef4444"
                  onMouseEnter={() => { hoveredBarRef.current = 'team'; }}
                  onClick={d => navigateToSeries(d, 'chart-bar')}
                  isAnimationActive={false}>
                  <LabelList content={labelTeamNeg} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 4 — Doughnut: Win/Loss Ratio */}
          <div className="chart-panel">
            <div className="chart-title">
              Win / Loss Ratio
              <div className="chart-selector-inline">
                <ChartSelector
                  selector={sel4} setSelector={setSel4}
                  options={selectorOptions}
                  singleTournament={singleTournament} singleName={singleName}
                />
              </div>
            </div>
            {doughnutData.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', paddingTop: '3.5rem', fontSize: '0.85rem' }}>No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={440}>
                <PieChart>
                  <Pie
                    data={doughnutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={82}
                    dataKey="value"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {doughnutData.map((entry, i) => (
                      <Cell key={i} fill={entry.name === 'Wins' ? '#22c55e' : '#ef4444'} />
                    ))}
                  </Pie>
                  <Tooltip content={renderDoughnutTooltip} />
                  <Legend formatter={v => <span style={{ color: '#c4b5fd', fontSize: '0.82rem' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default PlayerProfile;
