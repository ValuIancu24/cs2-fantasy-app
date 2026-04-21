import React, { useContext, useEffect, useMemo, useState } from 'react';
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

function TeamLogoOrName({ name, imageUrl }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || ''}
        style={{ width: 36, height: 36, objectFit: 'contain', display: 'block', flexShrink: 0, filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.65)) drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      />
    );
  }
  return <span style={{ fontWeight: 700 }}>{name || '?'}</span>;
}

function BarLabel({ x, y, width, height, value }) {
  if (value === undefined || value === null) return null;
  const labelY = value >= 0 ? y - 6 : y + height + 12;
  const fill = value === 0 ? '#9ca3af' : '#e9d5ff';
  const text = value > 0 ? `+${value}` : `${value}`;
  return (
    <text x={x + width / 2} y={labelY} textAnchor="middle" fill={fill} fontSize={10} fontWeight={700}>
      {text}
    </text>
  );
}

function makeTournLabels(sel, tournaments) {
  if (sel !== 'last2' || tournaments.length !== 2) return null;
  const t1len = tournaments[1]?.series?.length || 0;
  const t0len = tournaments[0]?.series?.length || 0;
  return {
    [Math.round((t1len - 1) / 2)]: tournaments[1]?.name,
    [Math.round(t1len + (t0len - 1) / 2)]: tournaments[0]?.name,
  };
}

function makeXTick(data, dateKey, labels) {
  return ({ x, y, payload }) => {
    const date = data[payload.value]?.[dateKey] || '';
    const name = labels?.[payload.value];
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={12} textAnchor="middle" fill="#c4b5fd" fontSize={10}>{date}</text>
        {name && (
          <text dy={27} textAnchor="middle" fill="#a78bfa" fontSize={12} fontWeight={600}>{name}</text>
        )}
      </g>
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
  const [sel2, setSel2] = useState('last2');
  const [sel3, setSel3] = useState('last2');
  const [sel4, setSel4] = useState('last2');

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
      { value: '1',     label: tournaments[1]?.name || 'Tournament 1' },
      { value: '0',     label: tournaments[0]?.name || 'Tournament 2' },
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

  // Chart 2 — radar
  const radarSeries = useMemo(() => buildSeries(tournaments, sel2), [tournaments, sel2]);

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
  const barData = useMemo(() => series3.map((s, i) => ({
    ...s,
    idx: i,
    dateLabel: fmtDate(s.scheduled_at),
  })), [series3]);

  const splitIdx3 = (sel3 === 'last2' && tournaments.length === 2)
    ? (tournaments[1]?.series?.length || 0) - 0.5
    : null;

  const tournLabels1 = useMemo(() => makeTournLabels(sel1, tournaments), [sel1, tournaments]);
  const tournLabels3 = useMemo(() => makeTournLabels(sel3, tournaments), [sel3, tournaments]);

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

  const handleBack = () => {
    if (location.state?.from === 'build-team') {
      navigate(`/team-builder/${location.state.leagueId}`);
    } else if (location.state?.from === 'match') {
      navigate(location.state.backUrl);
    } else {
      const restoredState = (location.state?.fromIntro && location.state?.leagueId)
        ? { fromIntro: true, leagueId: location.state.leagueId }
        : null;
      navigate(`/tournament/${tournamentId}/players`, { state: restoredState });
    }
  };

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
        <div className="chart-tooltip-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <TeamLogoOrName name={d.team1_name} imageUrl={d.team1_image_url} />
          <span>{score}</span>
          <TeamLogoOrName name={d.team2_name} imageUrl={d.team2_image_url} />
        </div>
        <div>
          <span style={{ color: '#22c55e' }}>K</span>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#ef4444' }}>D</span>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#eab308' }}>A</span>
          {': '}
          <strong style={{ color: '#22c55e' }}>{d.kills}</strong>
          <span style={{ color: '#9ca3af' }}>/</span>
          <strong style={{ color: '#ef4444' }}>{d.deaths}</strong>
          <span style={{ color: '#9ca3af' }}>/</span>
          <strong style={{ color: '#eab308' }}>{d.assists}</strong>
        </div>
        <div>Fantasy pts: <strong style={{ color: '#a78bfa' }}>{d.total_pts}</strong></div>
      </div>
    );
  };

  const renderBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const score = d.team1_score != null ? `${d.team1_score}–${d.team2_score}` : '?';
    const kdaPts = d.kda_pts ?? 0;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <TeamLogoOrName name={d.team1_name} imageUrl={d.team1_image_url} />
          <span>{score}</span>
          <TeamLogoOrName name={d.team2_name} imageUrl={d.team2_image_url} />
        </div>
        <div>
          <span style={{ color: '#22c55e' }}>K</span>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#ef4444' }}>D</span>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#eab308' }}>A</span>
          {': '}
          <strong style={{ color: '#22c55e' }}>{d.kills}</strong>
          <span style={{ color: '#9ca3af' }}>/</span>
          <strong style={{ color: '#ef4444' }}>{d.deaths}</strong>
          <span style={{ color: '#9ca3af' }}>/</span>
          <strong style={{ color: '#eab308' }}>{d.assists}</strong>
        </div>
        <div>Perf pts: <strong style={{ color: '#a78bfa' }}>{kdaPts > 0 ? `+${kdaPts}` : kdaPts}</strong></div>
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
      <button className="btn-text" type="button" onClick={handleBack}>
        {location.state?.from === 'match' ? '← Back to Match' : '← Back'}
      </button>

      {loading && <p className="muted" style={{ marginTop: '1rem' }}>Loading...</p>}
      {!loading && !player && <p className="muted" style={{ marginTop: '1rem' }}>Player not found.</p>}

      {player && (
        <div className="player-profile-header panel">
          {player.player_image_url && (
            <img src={player.player_image_url} alt={player.nickname} className="player-profile-photo" />
          )}
          <div className="player-profile-info">
            <h1 className="player-profile-name">{player.nickname}</h1>
            <div className="player-profile-team-row">
              {player.team_image_url
                ? <img src={player.team_image_url} alt={player.team_name || ''} className="player-profile-team-logo" />
                : <span className="muted player-profile-team">{player.team_name || '—'}</span>}
            </div>
            <span className="player-price player-profile-price">{fmtPrice(player.price)}</span>
          </div>
        </div>
      )}

      {player && !loading && !hasTournaments && (
        <p className="muted" style={{ marginTop: '1.5rem' }}>No statistics available.</p>
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
                  tick={makeXTick(lineData, 'date', tournLabels1)}
                  tickLine={false}
                  height={tournLabels1 ? 42 : 20}
                  interval={0}
                />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip content={renderLineTooltip} wrapperStyle={{ background: 'none', border: 'none', boxShadow: 'none', padding: 0 }} />
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
            <p style={{ textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
              Total matches: <strong style={{ color: '#c4b5fd' }}>{lineData.length}</strong>
            </p>
          </div>

          {/* Chart 2 — Radar: Average Stats */}
          <div className="chart-panel">
            <div className="chart-title">
              Average Stats
              <div className="chart-selector-inline">
                <ChartSelector
                  selector={sel2} setSelector={setSel2}
                  options={selectorOptions}
                  singleTournament={singleTournament} singleName={singleName}
                />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={520}>
              <RadarChart data={radarData} outerRadius="75%" margin={{ top: 16, right: 48, left: 48, bottom: 16 }}>
                <PolarGrid stroke="rgba(167,139,250,0.25)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#e9d5ff', fontSize: 13, fontWeight: 600 }} />
                <PolarRadiusAxis tick={false} axisLine={false} tickLine={false} />
                <Radar dataKey="value" stroke="#c084fc" strokeWidth={2} fill="#a78bfa" fillOpacity={0.35} isAnimationActive={false} dot={{ r: 4, fill: '#c084fc', strokeWidth: 0 }} />
                <Tooltip content={renderRadarTooltip} wrapperStyle={{ background: 'none', border: 'none', boxShadow: 'none', padding: 0 }} />
              </RadarChart>
            </ResponsiveContainer>
            <p style={{ textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
              Total matches: <strong style={{ color: '#c4b5fd' }}>{radarSeries.length}</strong>
            </p>
          </div>

          {/* Chart 3 — Vertical Bar: Performance Points per Match */}
          <div id="chart-bar" className="chart-panel">
            <div className="chart-title">
              Performance Points per Match
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
                <XAxis
                  dataKey="idx"
                  type="number"
                  domain={[-0.5, Math.max(barData.length - 0.5, 0.5)]}
                  ticks={barData.map(d => d.idx)}
                  tick={makeXTick(barData, 'dateLabel', tournLabels3)}
                  tickLine={false}
                  axisLine={false}
                  height={tournLabels3 ? 42 : 20}
                  interval={0}
                />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                {splitIdx3 !== null && (
                  <ReferenceLine x={splitIdx3} stroke="rgba(210,168,255,0.4)" strokeDasharray="4 3" />
                )}
                <Tooltip content={renderBarTooltip} wrapperStyle={{ background: 'none', border: 'none', boxShadow: 'none', padding: 0 }} />
                <Bar
                  dataKey="kda_pts"
                  minPointSize={4}
                  background={{ fill: 'transparent' }}
                  shape={(props) => {
                    const { x, y, width, height, value, background: bg, payload } = props;
                    const fill = (value ?? 0) === 0 ? '#6b7280' : '#a78bfa';
                    return (
                      <g style={{ cursor: 'pointer' }} onClick={() => navigateToSeries(payload, 'chart-bar')}>
                        <rect x={bg?.x ?? x} y={bg?.y ?? 0} width={bg?.width ?? width} height={bg?.height ?? height} fill="transparent" />
                        <rect x={x} y={y} width={width} height={height} fill={fill} />
                      </g>
                    );
                  }}
                  isAnimationActive={false}
                >
                  <LabelList content={BarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
              Total matches: <strong style={{ color: '#c4b5fd' }}>{barData.length}</strong>
            </p>
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
                    innerRadius={90}
                    outerRadius={140}
                    dataKey="value"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {doughnutData.map((entry, i) => (
                      <Cell key={i} fill={entry.name === 'Wins' ? '#22c55e' : '#ef4444'} />
                    ))}
                  </Pie>
                  <Tooltip content={renderDoughnutTooltip} wrapperStyle={{ background: 'none', border: 'none', boxShadow: 'none', padding: 0 }} />
                  <Legend
                    formatter={v => <span style={{ color: '#c4b5fd', fontSize: '0.82rem' }}>{v}</span>}
                    content={({ payload }) => (
                      <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.2rem', marginBottom: '0.5rem' }}>
                          {payload.map((entry, i) => (
                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: '#c4b5fd' }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: entry.color, display: 'inline-block' }} />
                              {entry.value}
                            </span>
                          ))}
                        </div>
                        <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                          Total matches: <strong style={{ color: '#c4b5fd' }}>{doughnutData.reduce((s, r) => s + r.value, 0)}</strong>
                        </span>
                      </div>
                    )}
                  />
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
