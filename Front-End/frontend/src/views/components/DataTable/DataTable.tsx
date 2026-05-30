import React, { useState, useMemo, useRef } from 'react';
import Icon from '../Icon';
import './DataTable.css';

/* ── Types ──────────────────────────────────────────────── */

export interface DataTableColumn<T extends object> {
  key: keyof T;
  label: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

export interface DataTableProps<T extends object> {
  title: string;
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: keyof T;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  searchKeys?: Array<keyof T>;
  headerActions?: React.ReactNode;
  emptyText?: string;
}

type SortDir = 'asc' | 'desc';

/* ── Helpers ─────────────────────────────────────────────── */

function sortRows<T extends object>(data: T[], key: keyof T, dir: SortDir): T[] {
  return [...data].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') {
      return dir === 'asc' ? va - vb : vb - va;
    }
    const cmp = String(va).toLowerCase().localeCompare(String(vb).toLowerCase(), 'zh-TW');
    return dir === 'asc' ? cmp : -cmp;
  });
}

function filterRows<T extends object>(data: T[], term: string, keys?: Array<keyof T>): T[] {
  if (!term.trim()) return data;
  const t = term.toLowerCase();
  return data.filter(row => {
    const vals = keys
      ? keys.map(k => row[k])
      : Object.values(row as Record<string, unknown>);
    return vals.some(v => String(v ?? '').toLowerCase().includes(t));
  });
}

/* ── Sort Icon ───────────────────────────────────────────── */

function SortIcon({ state }: { state: 'none' | 'asc' | 'desc' }) {
  if (state === 'asc')  return <Icon name="arrow_upward"   size={24} />;
  if (state === 'desc') return <Icon name="arrow_downward" size={24} />;
  return <Icon name="unfold_more" size={24} />;
}

/* ── Component ───────────────────────────────────────────── */

function DataTable<T extends object>({
  title,
  columns,
  data,
  rowKey,
  onRowClick,
  searchPlaceholder = '關鍵字搜尋…',
  searchKeys,
  headerActions,
  emptyText = '無資料',
}: DataTableProps<T>) {
  const [sortKey, setSortKey]       = useState<keyof T | null>(null);
  const [sortDir, setSortDir]       = useState<SortDir>('asc');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Sort handler ── */
  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      if (sortDir === 'asc') { setSortDir('desc'); }
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /* ── Search handlers ── */
  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const closeSearch = () => {
    setSearchTerm('');
    setSearchOpen(false);
  };

  const handleSearchBtnClick = () => {
    if (searchOpen) closeSearch(); else openSearch();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') closeSearch();
  };

  const handleInputBlur = () => {
    if (!searchTerm) closeSearch();
  };

  /* ── Derived data ── */
  const displayData = useMemo(() => {
    let result = filterRows(data, searchTerm, searchKeys);
    if (sortKey) result = sortRows(result, sortKey, sortDir);
    return result;
  }, [data, searchTerm, searchKeys, sortKey, sortDir]);

  /* ── Render ── */
  return (
    <div className="dt-panel">

      {/* Header */}
      <div className="dt-header">
        <span className="dt-title">{title}</span>

        <div className="dt-header-actions">
          {headerActions}

          {/* Search */}
          <div className={`dt-search${searchOpen ? ' open' : ''}`}>
            <input
              ref={inputRef}
              className="dt-search-input"
              type="text"
              value={searchTerm}
              placeholder={searchPlaceholder}
              onChange={e => setSearchTerm(e.target.value)}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
            />
            <button
              className="dt-search-btn"
              onClick={handleSearchBtnClick}
              title={searchOpen ? '關閉搜尋' : '搜尋'}
            >
              {searchOpen
                ? <Icon name="close"  size={24} />
                : <Icon name="search" size={24} />
              }
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="dt-scroll">
        <table className="dt-table">
          <thead>
            <tr>
              {columns.map(col => {
                const colKey = String(col.key);
                const isSorted = sortKey === col.key;
                const sortState = isSorted ? sortDir : 'none';
                const thClass = [
                  col.align === 'right'  ? 'right'  : '',
                  col.align === 'center' ? 'center' : '',
                  col.sortable ? 'sortable' : '',
                  isSorted     ? 'sorted'   : '',
                ].filter(Boolean).join(' ');

                return (
                  <th
                    key={colKey}
                    className={thClass || undefined}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="th-content">
                      {col.label}
                      {col.sortable && (
                        <span className="sort-icon">
                          <SortIcon state={sortState} />
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="dt-empty">
                  {searchTerm ? `找不到「${searchTerm}」的相關資料` : emptyText}
                </td>
              </tr>
            ) : (
              displayData.map(row => (
                <tr
                  key={String(row[rowKey])}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'clickable' : undefined}
                >
                  {columns.map(col => (
                    <td
                      key={String(col.key)}
                      className={
                        col.align === 'right'  ? 'right'  :
                        col.align === 'center' ? 'center' : undefined
                      }
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
