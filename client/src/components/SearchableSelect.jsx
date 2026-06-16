import React, { useEffect, useRef, useState } from 'react';
import './SearchableSelect.css';

function SearchableSelect({ options = [], value, onChange, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (val) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="ss-wrapper" ref={ref}>
      <button
        type="button"
        className="ss-trigger"
        onClick={() => setOpen(o => !o)}
      >
        <span className="ss-trigger-label">
          {selected ? selected.label : <span className="ss-placeholder">{placeholder}</span>}
        </span>
        <span className={`ss-arrow ${open ? 'open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="ss-dropdown">
          <div className="ss-search-wrap">
            <input
              autoFocus
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ss-search"
            />
          </div>
          <div className="ss-list">
            {filtered.length === 0 && (
              <div className="ss-empty">No results</div>
            )}
            {filtered.map(o => (
              <div
                key={o.value}
                className={`ss-option ${String(o.value) === String(value) ? 'active' : ''}`}
                onClick={() => select(o.value)}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
