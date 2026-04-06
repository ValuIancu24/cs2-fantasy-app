export function getFlagUrl(code) {
  if (!code || code.length !== 2) return null;
  return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}

export function FlagImg({ code, style = {} }) {
  const url = getFlagUrl(code);
  if (!url) return <span style={{ fontSize: '1rem' }}>🌐</span>;
  return (
    <img
      src={url}
      alt={code}
      style={{ width: 20, height: 'auto', borderRadius: 2, verticalAlign: 'middle', ...style }}
    />
  );
}
